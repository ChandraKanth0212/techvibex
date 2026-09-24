import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from src.synthetic.simulator import simulator_instance

router = APIRouter(prefix="/streams", tags=["Real-Time Streaming"])


@router.websocket("/ws/telemetry")
async def websocket_telemetry_stream(websocket: WebSocket):
    """WebSocket endpoint pushing 1Hz telemetry updates to Module 4 Command Center UI."""
    await websocket.accept()
    try:
        while True:
            # Advance simulation tick
            updated_telemetry = simulator_instance.tick()
            
            # Serialize to JSON array
            data = [t.model_dump(mode="json") for t in updated_telemetry]
            await websocket.send_json({"type": "TELEMETRY_UPDATE", "data": data})
            
            await asyncio.sleep(1.0)
    except WebSocketDisconnect:
        pass
