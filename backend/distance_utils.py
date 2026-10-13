import math
from typing import Tuple, Union

# Minimum and maximum sensible search radii in kilometres
MIN_RADIUS_KM = 0.5
MAX_RADIUS_KM = 100.0
DEFAULT_RADIUS_KM = 5.0
KM_TO_MILES_FACTOR = 0.621371
EARTH_RADIUS_KM = 6371.0


def validate_radius_km(radius_input: Union[str, float, int, None]) -> Tuple[bool, float, str]:
    """
    Validate search radius entered by user in kilometres.
    Supports decimal values (e.g. 3, 7.5, 12.5, 25).
    Rejects:
    - Empty or None
    - Non-numeric strings
    - Values <= 0
    - Values < MIN_RADIUS_KM (0.5 km)
    - Excessively large values > MAX_RADIUS_KM (100.0 km)
    Returns (is_valid, radius_km, error_message).
    """
    if radius_input is None:
        return False, DEFAULT_RADIUS_KM, "Search radius is required."

    if isinstance(radius_input, str):
        cleaned = radius_input.strip().lower().replace("km", "").strip()
        if not cleaned:
            return False, DEFAULT_RADIUS_KM, "Search radius cannot be empty."
        try:
            val = float(cleaned)
        except ValueError:
            return False, DEFAULT_RADIUS_KM, f"Invalid radius value '{radius_input}'. Please enter a valid number in kilometres (e.g. 5, 7.5, 15)."
    elif isinstance(radius_input, (int, float)):
        val = float(radius_input)
    else:
        return False, DEFAULT_RADIUS_KM, "Radius must be a numeric value in kilometres."

    if math.isnan(val) or math.isinf(val):
        return False, DEFAULT_RADIUS_KM, "Radius must be a finite number."

    if val <= 0:
        return False, DEFAULT_RADIUS_KM, "Search radius must be greater than 0 km."

    if val < MIN_RADIUS_KM:
        return False, DEFAULT_RADIUS_KM, f"Minimum search radius is {MIN_RADIUS_KM} km."

    if val > MAX_RADIUS_KM:
        return False, DEFAULT_RADIUS_KM, f"Maximum search radius is {MAX_RADIUS_KM} km."

    return True, round(val, 2), ""


def km_to_miles(km: float) -> float:
    """Convert kilometres to miles accurately."""
    return round(km * KM_TO_MILES_FACTOR, 2)


def miles_to_km(miles: float) -> float:
    """Convert miles to kilometres accurately."""
    return round(miles / KM_TO_MILES_FACTOR, 2)


def km_to_meters(km: float) -> int:
    """Convert kilometres to metres."""
    return int(round(km * 1000))


def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the great circle distance in kilometres between two points
    on the earth (specified in decimal degrees).
    """
    try:
        phi1 = math.radians(lat1)
        phi2 = math.radians(lat2)
        delta_phi = math.radians(lat2 - lat1)
        delta_lambda = math.radians(lon2 - lon1)

        a = math.sin(delta_phi / 2.0) ** 2 + \
            math.cos(phi1) * math.cos(phi2) * \
            math.sin(delta_lambda / 2.0) ** 2
        c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
        distance = EARTH_RADIUS_KM * c
        return round(distance, 2)
    except Exception:
        return 0.0
