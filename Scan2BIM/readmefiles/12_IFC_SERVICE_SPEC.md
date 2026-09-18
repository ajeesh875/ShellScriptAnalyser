# 12 — IFC Service Implementation Specification

Version: 1.0  
Status: Implementation Ready  
Prerequisite: 11_POST_PROCESSING_SERVICE_SPEC.md

---

## 1. Service Identity

| Property | Value |
|----------|-------|
| Name | `scan2bim-ifc-creator` |
| Role | Geometry JSON → IFC file conversion |
| Language | C# .NET 8 |
| Library | xBIM |
| Execution | CLI subprocess (invoked by Post-Processing) |
| Input | Geometry JSON file (see doc 11 for schema) |
| Output | IFC4 file |

---

## 2. Architecture Decision

The IFC Creator is retained as a .NET component because:
1. **xBIM** is the most mature open-source IFC library (no Python equivalent of comparable quality)
2. The component is **stable** — geometry JSON schema is the contract
3. Rewriting in Python would require IfcOpenShell which has limitations for complex BIM elements
4. The subprocess boundary provides clean isolation

**Integration pattern:** Post-Processing Service calls it as a subprocess:
```
dotnet IFCCreator.dll --input geometry.json --output model.ifc
```

---

## 3. IFC Entity Mapping

| Component Type | IFC Entity | IFC Type |
|---------------|-----------|----------|
| Wall | `IfcWall` | `IfcWallStandardCase` |
| Door | `IfcDoor` | `IfcDoor` |
| Floor | `IfcSlab` | `IfcSlabType.FLOOR` |
| Ceiling | `IfcCovering` | `IfcCoveringType.CEILING` |
| Rack | `IfcFurniture` | Custom property set |
| Cabinet | `IfcDistributionElement` | Custom property set |
| Battery Cabinet | `IfcDistributionElement` | Custom property set |
| Battery | `IfcDistributionElement` | Custom property set |
| Rectifier | `IfcDistributionElement` | Custom property set |

---

## 4. IFC File Structure

```
IFC4 File
├── IfcProject
│   └── IfcSite
│       └── IfcBuilding
│           └── IfcBuildingStorey (Floor Level)
│               ├── IfcWall (×N)
│               │   └── IfcDoor (openings)
│               ├── IfcSlab (floor)
│               ├── IfcCovering (ceiling)
│               ├── IfcFurniture (racks) (×N)
│               └── IfcDistributionElement (equipment) (×N)
│                   ├── Cabinets
│                   ├── Battery Cabinets
│                   ├── Batteries
│                   └── Rectifiers
└── Property Sets
    ├── Pset_Scan2BIM (custom)
    │   ├── WorkflowId
    │   ├── GeneratedAt
    │   ├── ModelVersion
    │   └── Confidence
    └── Component-specific properties
```

---

## 5. CLI Interface

```
Usage: dotnet IFCCreator.dll [options]

Options:
  --input <path>       Path to geometry.json (required)
  --output <path>      Path for output .ifc file (required)
  --version <string>   IFC schema version (default: IFC4)
  --project <string>   Project name (default: "Scan2BIM")
  --site <string>      Site name (default: "Telecom Shelter")
  --validate           Run IFC validation after creation
  --verbose            Enable verbose logging
```

**Exit codes:**
- `0` — Success
- `1` — Input file not found
- `2` — Invalid geometry JSON
- `3` — IFC creation error
- `4` — Validation failure

---

## 6. Core Implementation (C#)

```csharp
// Program.cs
using IFCCreator.Services;
using CommandLine;

var options = Parser.Default.ParseArguments<Options>(args).Value;
var creator = new IFCCreatorService();
var result = creator.CreateIFC(options.InputPath, options.OutputPath, new IFCOptions
{
    Version = options.Version,
    ProjectName = options.ProjectName,
    SiteName = options.SiteName,
});

if (options.Validate)
{
    var validator = new IFCValidator();
    validator.Validate(options.OutputPath);
}

return result.Success ? 0 : result.ErrorCode;
```

```csharp
// Services/IFCCreatorService.cs
public class IFCCreatorService
{
    public CreateResult CreateIFC(string inputPath, string outputPath, IFCOptions options)
    {
        var geometry = GeometryReader.Read(inputPath);
        
        using var model = IfcStore.Create(XbimSchemaVersion.Ifc4, XbimStoreType.InMemoryModel);
        using var txn = model.BeginTransaction("Create Scan2BIM Model");
        
        // Create project structure
        var project = CreateProject(model, options.ProjectName);
        var site = CreateSite(model, project, options.SiteName);
        var building = CreateBuilding(model, site);
        var storey = CreateStorey(model, building);
        
        // Create components
        foreach (var component in geometry.Components)
        {
            switch (component.ComponentType)
            {
                case "wall":
                    CreateWall(model, storey, component);
                    break;
                case "door":
                    CreateDoor(model, storey, component, geometry);
                    break;
                case "floor":
                    CreateSlab(model, storey, component, SlabType.Floor);
                    break;
                case "ceiling":
                    CreateCovering(model, storey, component);
                    break;
                case "rack":
                    CreateFurniture(model, storey, component);
                    break;
                default:
                    CreateDistributionElement(model, storey, component);
                    break;
            }
        }
        
        // Add Scan2BIM property set
        AddScan2BIMProperties(model, geometry);
        
        txn.Commit();
        model.SaveAs(outputPath);
        
        return new CreateResult { Success = true };
    }
}
```

---

## 7. Geometry → IFC Conversion Rules

### Wall

```csharp
private void CreateWall(IfcStore model, IfcBuildingStorey storey, ComponentGeometry comp)
{
    var wall = model.Instances.New<IfcWall>(w =>
    {
        w.Name = comp.ComponentId;
        w.ObjectPlacement = CreateLocalPlacement(model, comp.Position, comp.Rotation);
        w.Representation = CreateExtrudedProfile(model, comp.Dimensions);
    });
    
    // Add to storey
    storey.AddElement(wall);
}
```

### Position Mapping

```
Geometry JSON position (center) → IFC ObjectPlacement (origin)
    IFC origin = center - (dimensions / 2)
    
Geometry JSON rotation (degrees) → IFC Direction (cosines)
    IfcDirection = cos(rz), sin(rz), 0
```

---

## 8. Dockerfile (IFC Creator)

```dockerfile
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY IFCCreator/ .
RUN dotnet publish -c Release -o /app

FROM mcr.microsoft.com/dotnet/runtime:8.0
WORKDIR /app
COPY --from=build /app .
ENTRYPOINT ["dotnet", "IFCCreator.dll"]
```

**Note:** In the Post-Processing Dockerfile, the IFC Creator is embedded:
```dockerfile
# Post-Processing Dockerfile (includes .NET runtime for IFC)
FROM python:3.12-slim AS base

# Install .NET runtime
RUN apt-get update && apt-get install -y dotnet-runtime-8.0

COPY --from=ifc-builder /app /app/ifc-creator/
```

---

## 9. Local Development

For local development, the IFC Creator can be:
1. **Pre-built:** `dotnet publish` the .NET project, copy DLL to Post-Processing service
2. **Mocked:** Return a dummy IFC file for fast iteration
3. **Docker:** Run as separate container (for isolation testing)

```python
# Mock IFC creator for local dev (when .NET not available)
async def mock_create_ifc(geometry_json_path: str, output_path: str) -> dict:
    """Create a minimal valid IFC file for testing."""
    minimal_ifc = """ISO-10303-21;
HEADER;
FILE_DESCRIPTION((''),'2;1');
FILE_NAME('mock.ifc','2026-08-12',(''),(''),'','','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1=IFCPROJECT('mock',#2,'Scan2BIM Mock',$,$,$,$,$,#3);
ENDSEC;
END-ISO-10303-21;"""
    
    with open(output_path, "w") as f:
        f.write(minimal_ifc)
    
    return {"success": True, "file_size": len(minimal_ifc), "mock": True}
```
