import logging
import random
import requests
from urllib.parse import urlparse
from api_manager import get_api_key, disable_key
from distance_utils import validate_radius_km, haversine_distance_km
from dedup_manager import normalize_domain, normalize_phone

logger = logging.getLogger(__name__)

def search_and_enrich_businesses(category, city, area=None, radius=None, limit=5):
    """
    Search for businesses using SerpAPI (Google Maps), 
    and return structured lists of businesses.
    Uses kilometres (km) for all radius calculations and filters duplicates.
    """
    api_key = get_api_key("serpapi")
    
    # Validate and standardize radius in kilometres
    is_valid_rad, radius_km, _ = validate_radius_km(radius)
    
    # Construct search query with kilometre specification
    location_parts = []
    if area:
        location_parts.append(area)
    location_parts.append(city)
    location_str = ", ".join(location_parts)

    query = f"{category} within {radius_km}km of {location_str}"
    
    if not api_key:
        logger.info("SerpAPI key missing. Returning empty results.")
        return []
        
    try:
        logger.info(f"Running SerpAPI Google Maps search for: '{query}', radius: {radius_km}km, limit: {limit}")
        
        url = "https://serpapi.com/search.json"
        params = {
            "engine": "google_maps",
            "q": query,
            "type": "search",
            "api_key": api_key,
            "num": limit
        }
        
        response = requests.get(url, params=params, timeout=30)
        
        if response.status_code == 401 or response.status_code == 403:
            logger.error("SerpAPI auth failed (invalid key or quota).")
            disable_key("serpapi", api_key)
            return []
            
        response.raise_for_status()
        data = response.json()
        
        local_results = data.get("local_results", [])
        
        enriched_leads = []
        seen_place_ids = set()
        seen_domains = set()
        seen_phones = set()
        
        for item in local_results:
            place_id = item.get("place_id") or f"place_{random.randint(100000, 999999)}"
            
            # Deduplication Check 1: Google Place ID
            if place_id in seen_place_ids:
                continue
            seen_place_ids.add(place_id)
            
            website = item.get("website") or ""
            phone = item.get("phone") or ""

            # Deduplication Check 2: Website Domain
            norm_domain = normalize_domain(website)
            if norm_domain:
                if norm_domain in seen_domains:
                    continue
                seen_domains.add(norm_domain)

            # Deduplication Check 3: Normalized Phone
            norm_phone = normalize_phone(phone)
            if norm_phone and len(norm_phone) >= 7:
                if norm_phone in seen_phones:
                    continue
                seen_phones.add(norm_phone)

            lat = item.get("gps_coordinates", {}).get("latitude")
            lng = item.get("gps_coordinates", {}).get("longitude")
            
            item_category = item.get("type", category)
            
            lead = {
                "place_id": place_id,
                "name": item.get("title", "Unknown Business"),
                "address": item.get("address", f"{city}, USA"),
                "phone_number": phone,
                "website": website,
                "google_rating": float(item.get("rating", 0)) if item.get("rating") else 0.0,
                "review_count": int(item.get("reviews", 0)) if item.get("reviews") else 0,
                "latitude": float(lat) if lat else None,
                "longitude": float(lng) if lng else None,
                "category": item_category,
                "radius_km": radius_km,
                "contacts": {
                    "emails": [],
                    "phoneNumbers": [phone] if phone else [],
                    "socialLinks": {
                        "linkedin": "",
                        "facebook": "",
                        "instagram": "",
                        "twitter": "",
                        "youtube": ""
                    }
                }
            }
            
            enriched_leads.append(lead)
            
            if len(enriched_leads) >= limit:
                break
                
        return enriched_leads
        
    except Exception as e:
        logger.error(f"SerpAPI search failed: {e}. Disabling key and returning empty results.")
        disable_key("serpapi", api_key)
        return []

def get_domain_from_url(url):
    return normalize_domain(url)
