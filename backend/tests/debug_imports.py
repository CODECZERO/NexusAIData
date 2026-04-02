import sys

def trace(msg):
    print("->", msg, flush=True)

try:
    trace("import models")
    import models

    trace("import routers.api")
    import routers.api

    trace("import services.ai_service")
    import services.ai_service

    trace("import services.cache_service")
    import services.cache_service

    trace("import services.rag_service")
    import services.rag_service

    trace("import main")
    import main

    trace("SUCCESS")
except Exception as e:
    trace(f"ERROR: {e}")
