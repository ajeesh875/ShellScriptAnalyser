IFC Post Processing

 

 

# Inshelter Post-Processing Microservice — Architecture & Function Flow

 

## Position in Pipeline

 

```

  ┌──────────────────┐          ┌──────────────────────────┐          ┌────────────────┐

  │ Segmentation MS  │──queue──▶│  POST-PROCESSING MS      │──subprocess▶│ IFC Creation  │

  │ (PLY files)      │          │  ◀── YOU ARE HERE        │──signal──▶│ Root MS        │

  └──────────────────┘          └──────────────────────────┘          └────────────────┘

```

 

**Upstream:** Segmentation MS dispatches to `post-processing-queue` with segmentedFiles[]

**Downstream:** IFC Creation (embedded .NET DLL subprocess) + Root MS (HTTP signal)

 

---

 

## Overview

 

The Post-Processing Microservice extracts geometry from segmented point clouds, resolves spatial conflicts between components, performs image-based equipment detection, creates IFC files, and uploads results to DataRepo.

 

| Property | Value |

|----------|-------|

| Language | Python |

| Port | 4000 (health server, separate process) |

| Mode | Long-running consumer (continuous) |

| IFC Engine | .NET DLL (IFCCreator.dll) invoked via subprocess |

| Memory | 20Gi request / 24Gi limit |

 

---

 

## Module Structure

 

```

app/

├── main.py                       # Entry: QueueConsumer + health server (multiprocessing)

├── queue/

│   ├── message_consumer.py       # Service Bus consumer + full processing orchestration

│   └── message_producer.py       # Sends completion signals to root queue

├── service/

│   ├── post_processing_service.py  # Main pipeline orchestration

│   ├── point_cloud_processing.py   # Geometry extraction from PLY files

│   └── image_processing.py         # YOLO-based rack equipment detection

├── components/                   # Per-class geometry extractors

│   ├── wall.py                   # Wall plane extraction (histogram → contour → line fit)

│   ├── door.py                   # Door detection within wall bounds

│   ├── rack.py                   # Rack detection (OBB + equipment Z-grouping)

│   ├── cabinet.py                # Cabinet detection

│   ├── battery_cabinet.py        # Battery cabinet detection

│   ├── battery.py                # Battery detection (relative to parent)

│   ├── rectifier.py              # Rectifier detection (relative to parent)

│   └── floor_ceiling.py          # Floor/ceiling plane extraction

├── ifc_service/

│   ├── ifc_creator.py            # Python wrapper → invokes dotnet IFCCreator.dll

│   └── IFCCreator.dll            # .NET compiled DLL (xBIM)

├── geometry/                     # Geometric math utilities

├── ml_models/                    # YOLO model for rack equipment detection

├── helper/

│   ├── blob_helper.py            # Azure Blob download/upload

│   ├── cognito_helper.py         # Cognito token (DataRepo auth)

│   ├── conflict_resolver.py      # Equipment overlap resolution

│   └── retry_helper.py           # Exponential backoff

├── api/

│   ├── get/upload_sas.py         # Get SAS upload URL from DataRepo

│   └── post/upload_ifc.py        # PUT IFC to SAS URL

├── config/config_reader.py       # Configuration (env vars + config.ini)

├── database/jobs_repo.py         # MongoDB job tracking

├── schemas/message_schema.py     # Pydantic message models

├── temporal/client.py            # Temporal progress signals

├── Properties/Property.py        # Project/site metadata extraction

└── utils/                        # Rotation, elevation, wall utilities

```

 

---

 

## Function Flow

 

### Main Pipeline (`post_processing_service.py`)

 

```python

def post_processing_main(input_path: str, meta_data: dict = {}) -> str:

    """

    Complete post-processing pipeline. Returns IFC file path.

   

    Steps:

    1. process_point_cloud()         → geometry extraction from PLY files

    2. resolve_equipment_conflicts() → fix overlaps between equipment types

    3. resolve_equipment_wall_conflicts() → ensure equipment doesn't penetrate walls

    4. FloorCeiling.extract_geometry() → floor/ceiling slabs from elevation data

    5. image_processing_main()       → YOLO rack equipment detection from images

    6. check_rack_equipment_overlap_and_adjust() → final rack equipment layout

    7. Write JSON file               → {dir_name}.json

    8. IFCCreator.create_ifc()       → JSON → IFC via .NET DLL subprocess

   

    Returns: path to IFC file (or "" if failed)

    """

```

 

### Geometry Extraction (`point_cloud_processing.py`)

 

```python

def process_point_cloud(input_path, out_path, meta_data) -> (dict, list, list):

    """

    Extracts geometry from segmented PLY files.

   

    Returns:

    - data: dict with all component geometry

    - elevation_list: [floor_z, ceiling_z]

    - rotation_param: [angle, cx, cy, is_rotated]

   

    Extraction Order:

    1. get_elevation()      → floor Z from floor PLY

    2. Wall()               → wall planes, rotation detection, height

    3. Cabinet()            → cabinet OBBs

    4. BatteryCabinet()     → battery cabinet OBBs

    5. Door()               → doors within wall bounds

    6. RACK()               → rack clusters + equipment Z-grouping

    7. Rectifier()          → rectifiers relative to parent cabinets

    8. Battery()            → batteries relative to parent cabinets

    9. Property()           → project/site metadata from payload

    10. Height adjustment   → extend walls if equipment exceeds ceiling

    """

```

 

### Component Extractors Detail

 

```python

class Wall:

    """

    Input: wall PLY + elevation_list

    Algorithm:

    1. Load wall point cloud

    2. Apply rotation correction (if shelter is not axis-aligned)

    3. 2D histogram projection (XY plane)

    4. Edge detection → contour extraction

    5. Line fitting (Hough or RANSAC)

    6. Connect adjacent wall segments

    7. Compute mean wall width from point spread

    Output: wall segments with BottomFacePoints + Height

    """

 

class Door:

    """

    Input: door PLY + wall geometry (data dict)

    Algorithm:

    1. Load door points

    2. Find which wall plane contains each door

    3. Cluster door points

    4. Get bounding dimensions (height, width)

    5. Compute location (insertion point on wall)

    Output: doors with Wall_Id, Height, Length, Location

    """

 

class RACK:

    """

    Input: rack PLY + elevation_list

    Algorithm:

    1. Load rack point cloud

    2. DBSCAN clustering to separate individual racks

    3. OBB fitting per cluster (oriented bounding box)

    4. Detect pillar edges (vertical corner features)

    5. Z-level grouping of internal equipment (shelves)

    6. Assign Equipment_Id to each detected item

    Output: racks with BottomFacePoints, Height, PillarEdgeIndices, Equipments[]

    """

 

class Cabinet / BatteryCabinet:

    """

    Input: cabinet PLY + elevation_list

    Algorithm:

    1. DBSCAN clustering

    2. OBB fitting per cluster

    3. Apply rotation correction

    Output: cabinets with BottomFacePoints + Height + closed_section

    """

 

class Battery / Rectifier:

    """

    Input: battery/rectifier PLY + data dict (parent cabinets)

    Algorithm:

    1. Load points

    2. Associate with nearest parent cabinet (by spatial proximity)

    3. Extract dimensions within parent bounds

    Output: items with Parent_Id, BottomFacePoints, Height

    """

 

class FloorCeiling:

    """

    Input: elevation_list + data dict + rotation_param

    Algorithm:

    1. Use wall boundary to define floor/ceiling polygon

    2. Create horizontal slabs at floor_z and ceiling_z

    3. Apply configurable thickness (from config.ini)

    Output: floor + ceiling with Points polygon + Type

    """

```

 

### Image Processing (YOLO-based)

 

```python

def image_processing_main(images_dir, data, out_path):

    """

    Uses YOLO model to detect equipment in 2D images extracted from E57.

    Detected equipment is mapped back to 3D rack positions.

    Types: Router, Switch, Surge Protector, etc.

    Results merged into data['rack'][i]['Equipments']

    """

```

 

### Conflict Resolution

 

```python

def resolve_equipment_conflicts(data, logger):

    """Resolves overlaps between cabinet, battery_cabinet, rack, battery."""

 

def resolve_equipment_wall_conflicts(data, logger):

    """Ensures equipment bounding boxes don't penetrate wall planes."""

 

def check_rack_equipment_overlap_and_adjust(rack, logger):

    """Adjusts overlapping equipment within a single rack."""

```

 

### IFC Creation (Subprocess)

 

```python

class IFCCreator:

    def create_ifc(self, json_file_path: str) -> tuple[bool, str]:

        """

        Invokes: dotnet IFCCreator.dll <json_path>

        Timeout: 5 minutes

        Output: New_{filename}.ifc in same directory as JSON

        Returns: (success, stdout/stderr message)

        """

```

 

---

 

## Output JSON Structure

 

```json

{

  "wall": [{ "Wall_Id": "W0", "Type": "wall", "Height": 3.2, "BottomFacePoints": [...], "PropertySets": [...] }],

  "door": [{ "Door_Id": "D0", "Wall_Id": "W0", "Height": 2.1, "Length": 0.9, "Location": {...} }],

  "cabinet": [{ "Cabinet_Id": "C0", "Height": 2.0, "BottomFacePoints": [...] }],

  "battery_cabinet": [{ "BatteryCabinet_Id": "BC0", "Height": 1.8, "HasBattery": true, ... }],

  "rack": [{ "Rack_Id": "R0", "Height": 2.2, "BottomFacePoints": [...], "Equipments": [...], "PillarEdgeIndices": [...] }],

  "battery": [{ "Battery_Id": "B0", "Parent_Id": "BC0", "Height": 0.5, ... }],

  "rectifier": [{ "Rectifier_Id": "Rect0", "Parent_Id": "BC0", "Height": 0.3, ... }],

  "floor_ceiling": [{ "Unique_Id": "F0", "Type": "floor", "Points": [...] }],

  "project_properties": {...},

  "site_properties": {...}

}

```

 

---

 

## Upload & Signaling

 

```python

# 1. Upload IFC to DataRepo (primary):

#    GET SAS upload URL from DataRepo API (Cognito auth)

#    PUT IFC file to SAS URL

 

# 2. Upload IFC to Blob (backup):

#    segmentation-store/ifc/{fileId}.ifc

 

# 3. Signal Root MS:

POST /api/signal/activity

{ "workflowId": "...", "activityName": "POST_PROCESSING", "status": "COMPLETED" }

```

 

---

 

## Connection to Previous Service (Segmentation MS)

 

Segmentation dispatches directly to post-processing queue with:

- `segmentedFiles[]` — blob paths to per-class PLY files

- `imageFiles[]` — blob paths to extracted images

- Site metadata (customer, site, project, coordinates)

 

## Connection to Next Service (IFC Creation / Root MS)

 

- IFC Creation is **embedded** as a .NET DLL subprocess (`dotnet IFCCreator.dll`)

- After IFC creation, signals Root MS completion via HTTP

- Root MS then marks workflow as COMPLETED in Temporal + MongoDB

 

 