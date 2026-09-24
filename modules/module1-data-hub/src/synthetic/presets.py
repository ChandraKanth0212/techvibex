import uuid
from typing import Dict, List, Any

# Pre-configured Golden Quadrilateral Corridor (New Delhi -> Kanpur Central)
NDLS_CNB_CORRIDOR_PRESET: Dict[str, Any] = {
    "corridor_name": "Delhi-Kanpur Express Corridor (Golden Quadrilateral)",
    "stations": [
        {
            "id": "11111111-1111-1111-1111-111111111111",
            "code": "NDLS",
            "name": "New Delhi",
            "latitude": 28.6430,
            "longitude": 77.2194,
            "total_platforms": 16,
            "loop_lines_count": 8,
            "is_junction": True
        },
        {
            "id": "22222222-2222-2222-2222-222222222222",
            "code": "ALJN",
            "name": "Aligarh Junction",
            "latitude": 27.8974,
            "longitude": 78.0880,
            "total_platforms": 7,
            "loop_lines_count": 4,
            "is_junction": True
        },
        {
            "id": "33333333-3333-3333-3333-333333333333",
            "code": "TDL",
            "name": "Tundla Junction",
            "latitude": 27.2069,
            "longitude": 78.2411,
            "total_platforms": 5,
            "loop_lines_count": 6,
            "is_junction": True
        },
        {
            "id": "44444444-4444-4444-4444-444444444444",
            "code": "ETW",
            "name": "Etawah Junction",
            "latitude": 26.7769,
            "longitude": 79.0305,
            "total_platforms": 5,
            "loop_lines_count": 4,
            "is_junction": True
        },
        {
            "id": "55555555-5555-5555-5555-555555555555",
            "code": "CNB",
            "name": "Kanpur Central",
            "latitude": 26.4547,
            "longitude": 80.3507,
            "total_platforms": 10,
            "loop_lines_count": 8,
            "is_junction": True
        }
    ],
    "sections": [
        {
            "id": "a1111111-1111-1111-1111-111111111111",
            "section_code": "SEC_NDLS_ALJN",
            "source_station_code": "NDLS",
            "target_station_code": "ALJN",
            "length_km": 131.0,
            "max_speed_kmh": 130.0,
            "track_count": 2,
            "geo_path": [[28.6430, 77.2194], [28.2500, 77.6000], [27.8974, 78.0880]]
        },
        {
            "id": "a2222222-2222-2222-2222-222222222222",
            "section_code": "SEC_ALJN_TDL",
            "source_station_code": "ALJN",
            "target_station_code": "TDL",
            "length_km": 78.0,
            "max_speed_kmh": 130.0,
            "track_count": 2,
            "geo_path": [[27.8974, 78.0880], [27.5000, 78.1500], [27.2069, 78.2411]]
        },
        {
            "id": "a3333333-3333-3333-3333-333333333333",
            "section_code": "SEC_TDL_ETW",
            "source_station_code": "TDL",
            "target_station_code": "ETW",
            "length_km": 92.0,
            "max_speed_kmh": 130.0,
            "track_count": 2,
            "geo_path": [[27.2069, 78.2411], [26.9800, 78.6000], [26.7769, 79.0305]]
        },
        {
            "id": "a4444444-4444-4444-4444-444444444444",
            "section_code": "SEC_ETW_CNB",
            "source_station_code": "ETW",
            "target_station_code": "CNB",
            "length_km": 139.0,
            "max_speed_kmh": 130.0,
            "track_count": 2,
            "geo_path": [[26.7769, 79.0305], [26.6000, 79.7000], [26.4547, 80.3507]]
        }
    ],
    "trains": [
        {
            "id": "b1111111-1111-1111-1111-111111111111",
            "train_number": "12951",
            "train_name": "MUMBAI RAJDHANI EXPRESS",
            "train_type": "PASSENGER",
            "priority": "PRIORITY_1",
            "max_speed_kmh": 130.0,
            "length_meters": 650.0
        },
        {
            "id": "b2222222-2222-2222-2222-222222222222",
            "train_number": "12004",
            "train_name": "LUCKNOW SHATABDI EXPRESS",
            "train_type": "PASSENGER",
            "priority": "PRIORITY_1",
            "max_speed_kmh": 130.0,
            "length_meters": 550.0
        },
        {
            "id": "b3333333-3333-3333-3333-333333333333",
            "train_number": "BOXN-9021",
            "train_name": "COAL FREIGHT SPECIAL",
            "train_type": "FREIGHT",
            "priority": "PRIORITY_5",
            "max_speed_kmh": 75.0,
            "length_meters": 720.0
        }
    ]
}
