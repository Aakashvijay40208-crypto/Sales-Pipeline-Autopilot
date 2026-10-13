import pytest
from distance_utils import (
    validate_radius_km,
    km_to_miles,
    miles_to_km,
    km_to_meters,
    haversine_distance_km
)


def test_validate_radius_km_valid_numbers():
    # Integer
    valid, val, err = validate_radius_km(5)
    assert valid is True
    assert val == 5.0
    assert not err

    # Decimal
    valid, val, err = validate_radius_km(7.5)
    assert valid is True
    assert val == 7.5
    assert not err

    # String with decimal
    valid, val, err = validate_radius_km("12.5")
    assert valid is True
    assert val == 12.5
    assert not err

    # String with 'km' suffix
    valid, val, err = validate_radius_km("25 km")
    assert valid is True
    assert val == 25.0
    assert not err


def test_validate_radius_km_invalid_inputs():
    # None or empty
    valid, val, err = validate_radius_km("")
    assert valid is False
    assert "cannot be empty" in err

    # Zero
    valid, val, err = validate_radius_km(0)
    assert valid is False
    assert "greater than 0 km" in err

    # Too small (< 0.5 km)
    valid, val, err = validate_radius_km(0.2)
    assert valid is False
    assert "Minimum search radius is 0.5 km" in err

    # Negative
    valid, val, err = validate_radius_km(-5)
    assert valid is False
    assert "greater than 0 km" in err

    # Excessively large (>100 km)
    valid, val, err = validate_radius_km(150)
    assert valid is False
    assert "Maximum search radius is 100.0 km" in err

    # Non-numeric string
    valid, val, err = validate_radius_km("nearby")
    assert valid is False
    assert "valid number" in err


def test_distance_conversions():
    # 10 km to miles
    miles = km_to_miles(10.0)
    assert round(miles, 2) == 6.21

    # 6.21371 miles back to km
    km = miles_to_km(miles)
    assert round(km, 1) == 10.0

    # 5.5 km to meters
    meters = km_to_meters(5.5)
    assert meters == 5500


def test_haversine_calculation():
    # Distance between New York City and Philadelphia is approx 130 km
    nyc_lat, nyc_lng = 40.7128, -74.0060
    philly_lat, philly_lng = 39.9526, -75.1652

    dist = haversine_distance_km(nyc_lat, nyc_lng, philly_lat, philly_lng)
    assert 120 < dist < 145
