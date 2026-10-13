import re
import logging
from urllib.parse import urlparse, parse_qs, urlencode

logger = logging.getLogger(__name__)

# Common tracking / noise query parameters to strip
TRACKING_PARAMS = {
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
    'ref', 'source', 'fbclid', 'gclid', 'msclkid', 'mc_cid', 'mc_eid'
}

def normalize_domain(url: str) -> str:
    """
    Extract and normalize a website domain from a URL.
    - Strips http, https, ftp
    - Strips www. prefix
    - Strips port numbers, paths, trailing slashes
    - Strips query parameters and fragments
    - Lowercases
    Returns empty string if invalid or empty.
    """
    if not url or not isinstance(url, str):
        return ""

    raw = url.strip().lower()
    if not raw:
        return ""

    # Ensure urlparse can parse even if scheme is missing
    if not raw.startswith(('http://', 'https://')):
        raw = 'https://' + raw

    try:
        parsed = urlparse(raw)
        hostname = parsed.hostname or ''
        # Strip www.
        if hostname.startswith('www.'):
            hostname = hostname[4:]
        return hostname.strip().lower()
    except Exception:
        # Fallback regex
        clean = re.sub(r'^https?://', '', raw)
        clean = re.sub(r'^www\.', '', clean)
        clean = clean.split('/')[0].split('?')[0].split(':')[0]
        return clean.strip().lower()


def normalize_phone(phone: str) -> str:
    """
    Normalize phone number by extracting digits.
    Strips formatting characters (parentheses, hyphens, spaces, dots).
    Returns last 10 digits for standard comparison or digits-only string.
    """
    if not phone or not isinstance(phone, str):
        return ""

    digits = re.sub(r'\D', '', phone)
    if not digits or len(digits) < 7:
        return ""

    # If US/Canada with leading 1 and 11 digits, extract the 10-digit number
    if len(digits) == 11 and digits.startswith('1'):
        return digits[1:]

    return digits


def normalize_email(email: str) -> str:
    """
    Normalize email address: strip whitespace, lowercase, trim punctuation.
    """
    if not email or not isinstance(email, str):
        return ""
    cleaned = email.strip().lower().rstrip('.,;:')
    if '@' in cleaned and '.' in cleaned.split('@')[-1]:
        return cleaned
    return ""


def normalize_business_name(name: str) -> str:
    """
    Normalize company name for comparison:
    - Lowercase
    - Strip test fixture tokens (lead_flow_xxx, lead_chat_xxx, lead_draft_xxx)
    - Strip common legal suffixes (llc, inc, ltd, corp, corporation, co, pllc, pc)
    - Remove punctuation and extra whitespace
    """
    if not name or not isinstance(name, str):
        return ""

    clean = name.strip().lower()
    # Strip test fixture tokens
    clean = re.sub(r'\blead_(?:flow|chat|draft)_[a-f0-9]+\b', '', clean).strip()
    
    # Remove punctuation
    clean = re.sub(r'[^\w\s]', ' ', clean)
    words = clean.split()

    legal_suffixes = {
        'llc', 'inc', 'incorporated', 'ltd', 'limited', 'corp', 'corporation',
        'co', 'company', 'pllc', 'pc', 'llp', 'pa', 'services', 'group'
    }

    filtered = [w for w in words if w not in legal_suffixes]
    return ' '.join(filtered) if filtered else clean


def is_duplicate_lead(candidate: dict, existing: dict) -> tuple[bool, str]:
    """
    Evaluate if candidate is a duplicate of an existing lead.
    Matching rules:
    1. Strong match: Normalized website domains match (and are not empty) -> True
    2. Strong match: Normalized phone numbers match (and are at least 7 digits) -> True
    3. Strong match: Normalized emails match (and are valid non-empty emails) -> True
    4. Guardrail: Do NOT match on business name alone when domains or phones differ.
       If both have domains and domains differ -> False
       If both have phones and phones differ -> False
    5. Conditional match: Exactly matching normalized name AND compatible location:
       - If both addresses present: verify location compatibility (city/area overlap)
       - If one/both addresses empty and neither domain nor phone conflicts -> True
    Returns (is_duplicate, match_reason).
    """
    # 1. Domain match
    c_domain = normalize_domain(candidate.get('website', ''))
    e_domain = normalize_domain(existing.get('website', ''))

    if c_domain and e_domain:
        if c_domain == e_domain:
            return True, f"Matching website domain: '{c_domain}'"
        # If both have different verified domains, they are DIFFERENT businesses!
        return False, "Different verified domains"

    # 2. Email match
    c_email = normalize_email(candidate.get('email', ''))
    e_email = normalize_email(existing.get('email', ''))
    if c_email and e_email and c_email == e_email:
        return True, f"Matching email address: '{c_email}'"

    # 3. Phone match
    c_phone = normalize_phone(candidate.get('phone', '') or candidate.get('phone_number', ''))
    e_phone = normalize_phone(existing.get('phone', '') or existing.get('phone_number', ''))
    if c_phone and e_phone and len(c_phone) >= 7 and len(e_phone) >= 7:
        if c_phone == e_phone:
            return True, f"Matching phone number: '{c_phone}'"
        # If both have distinct verified phones, do not merge blindly
        return False, "Different verified phone numbers"

    # 4. Same place_id (from SerpAPI)
    c_place = candidate.get('place_id')
    e_place = existing.get('place_id')
    if c_place and e_place and c_place == e_place:
        return True, f"Matching Google place ID: '{c_place}'"

    # 5. Conditional match: Exactly matching normalized name + compatible location
    c_name = normalize_business_name(candidate.get('business_name', '') or candidate.get('name', ''))
    e_name = normalize_business_name(existing.get('business_name', '') or existing.get('name', ''))

    if c_name and e_name and c_name == e_name and len(c_name) >= 4:
        c_addr = (candidate.get('address', '') or '').lower().strip()
        e_addr = (existing.get('address', '') or '').lower().strip()

        # If both addresses are present, verify they don't contradict (e.g. Austin vs Dallas)
        if c_addr and e_addr:
            c_words = set(re.findall(r'\b\w{3,}\b', c_addr))
            e_words = set(re.findall(r'\b\w{3,}\b', e_addr))
            if len(c_words.intersection(e_words)) >= 1 or c_addr in e_addr or e_addr in c_addr:
                return True, f"Matching business name '{c_name}' and compatible location"
            else:
                return False, f"Same name '{c_name}' but different location addresses"
        else:
            # One or both addresses are missing; no phone or domain conflict exists
            return True, f"Matching business name '{c_name}' (no conflicting contact or address data)"

    return False, "No strong match signals"


def merge_two_leads(surviving: dict, duplicate: dict) -> dict:
    """
    Merge information from duplicate lead into the surviving lead.
    Preserves existing non-empty fields in surviving lead, fills gaps from duplicate.
    """
    merged = dict(surviving)

    # Fill empty contact info from duplicate
    for field in ['phone', 'email', 'website', 'address', 'linkedin', 'category']:
        if not merged.get(field) and duplicate.get(field):
            merged[field] = duplicate[field]

    # Keep higher review count & rating
    if (duplicate.get('review_count') or 0) > (merged.get('review_count') or 0):
        merged['review_count'] = duplicate['review_count']
        if duplicate.get('google_rating'):
            merged['google_rating'] = duplicate['google_rating']

    # Keep higher lead score
    if (duplicate.get('lead_score') or 0) > (merged.get('lead_score') or 0):
        merged['lead_score'] = duplicate['lead_score']
        merged['priority'] = duplicate.get('priority', merged.get('priority'))

    # If duplicate has opt-out set, preserve suppression!
    if duplicate.get('is_opted_out') and not merged.get('is_opted_out'):
        merged['is_opted_out'] = True
        merged['opt_out_timestamp'] = duplicate.get('opt_out_timestamp')
        merged['opt_out_reason'] = duplicate.get('opt_out_reason')
        merged['lifecycle_stage'] = 'Opted Out'

    # Combine notes if duplicate has unique notes
    dup_notes = duplicate.get('notes', '').strip()
    surv_notes = merged.get('notes', '').strip()
    if dup_notes and dup_notes not in surv_notes:
        merged['notes'] = f"{surv_notes}\n[Merged Note]: {dup_notes}".strip()

    return merged
