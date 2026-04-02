import asyncio
import websockets
import json

async def test():
    uri = "ws://127.0.0.1:8000/ws/chat/fa93616a"
    try:
        async with websockets.connect(uri) as ws:
            payload = {
                "message": "test context",
                "role": "analyst"
            }
            await ws.send(json.dumps(payload))
            print("sent")
            resp1 = await ws.recv()
            print("resp1:", resp1)
            resp2 = await ws.recv()
            print("resp2:", resp2)
    except Exception as e:
        print("EXCEPTION:", repr(e))

asyncio.run(test())
