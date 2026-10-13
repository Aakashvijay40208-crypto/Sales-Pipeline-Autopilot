import pytest
from dedup_manager import (
    normalize_domain,
    normalize_phone,
    normalize_email,
    normalize_business_name,
    is_duplicate_lead,
    merge_two_leads
)


def test_normalize_domain():
    # Various protocols, www, ports, trailing slashes, tracking queries
    assert normalize_domain("https://www.example.com/") == "example.com"
    assert normalize_domain("http://example.com/contact?utm_source=google") == "example.com"
    assert normalize_domain("https://sub.example.com:8080/page") == "sub.example.com"
    assert normalize_domain("WWW.DENTIST-AUSTIN.COM///") == "dentist-austin.com"
    assert normalize_domain("") == ""
    assert normalize_domain(None) == ""


def test_normalize_phone():
    # Standard US format
    assert normalize_phone("(512) 555-0199") == "5125550199"
    assert normalize_phone("+1 512 555 0199") == "5125550199"
    assert normalize_phone("512.555.0199") == "5125550199"
    assert normalize_phone("555-0199") == "5550199"
    assert normalize_phone("123") == ""  # Too short


def test_normalize_email():
    assert normalize_email(" DrJohn@Dentist.COM ") == "drjohn@dentist.com"
    assert normalize_email("contact@company.com.") == "contact@company.com"
    assert normalize_email("invalid-email") == ""


def test_normalize_business_name():
    assert normalize_business_name("Austin Family Dentistry, LLC") == "austin family dentistry"
    assert normalize_business_name("Peak Performance Inc.") == "peak performance"
    assert normalize_business_name("Apex Legal Group, PLLC") == "apex legal"


def test_is_duplicate_lead_matching():
    # Matching website domains
    lead1 = {"website": "https://www.austindental.com", "business_name": "Austin Dental"}
    lead2 = {"website": "http://austindental.com?src=fb", "business_name": "Austin Dental Care"}
    is_dup, reason = is_duplicate_lead(lead1, lead2)
    assert is_dup is True
    assert "Matching website domain" in reason

    # Matching phone numbers
    lead3 = {"phone": "(512) 888-0011", "business_name": "Lone Star Plumbing"}
    lead4 = {"phone": "512.888.0011", "business_name": "Lone Star Plumbers LLC"}
    is_dup, reason = is_duplicate_lead(lead3, lead4)
    assert is_dup is True
    assert "Matching phone number" in reason

    # Guardrail: Different verified domains must NOT be merged even if names are similar
    lead5 = {"website": "https://apex-austin.com", "business_name": "Apex Cleaners"}
    lead6 = {"website": "https://apex-dallas.com", "business_name": "Apex Cleaners"}
    is_dup, reason = is_duplicate_lead(lead5, lead6)
    assert is_dup is False
    assert "Different verified domains" in reason

    # Guardrail: Different verified phones must NOT be merged
    lead7 = {"phone": "512-555-1111", "business_name": "Metro Salon"}
    lead8 = {"phone": "512-555-2222", "business_name": "Metro Salon"}
    is_dup, reason = is_duplicate_lead(lead7, lead8)
    assert is_dup is False
    assert "Different verified phone numbers" in reason


def test_merge_two_leads():
    surviving = {
        "id": "lead_primary",
        "business_name": "Austin Dental Studio",
        "website": "https://austindental.com",
        "phone": "",
        "email": "",
        "google_rating": 4.2,
        "review_count": 10,
        "lead_score": 60,
        "is_opted_out": False
    }

    duplicate = {
        "id": "lead_secondary",
        "phone": "512-555-9988",
        "email": "info@austindental.com",
        "google_rating": 4.8,
        "review_count": 25,
        "lead_score": 75,
        "notes": "Spoke to office manager.",
        "is_opted_out": True,
        "opt_out_timestamp": "2026-10-13T00:00:00Z"
    }

    merged = merge_two_leads(surviving, duplicate)
    assert merged["id"] == "lead_primary"
    # Preserved and filled fields
    assert merged["phone"] == "512-555-9988"
    assert merged["email"] == "info@austindental.com"
    # Higher rating / reviews
    assert merged["google_rating"] == 4.8
    assert merged["review_count"] == 25
    assert merged["lead_score"] == 75
    # Preserved suppression / opt-out
    assert merged["is_opted_out"] is True
    assert "[Merged Note]: Spoke to office manager." in merged["notes"]
