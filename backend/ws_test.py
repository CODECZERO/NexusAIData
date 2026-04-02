import asyncio
import websockets
import json

async def test():
    uri = "ws://127.0.0.1:8000/ws/chat/c5b8b928"
    async with websockets.connect(uri) as ws:
        payload = {
            "message": "Give me the top 5 insights.",
            "role": "analyst",
            "current_intent": None
        }
        await ws.send(json.dumps(payload))
        try:
            while True:
                response = await ws.recv()
                print("Received:", response)
        except websockets.exceptions.ConnectionClosed as e:
            print(f"Closed: {e.code} {e.reason}")

asyncio.run(test())
