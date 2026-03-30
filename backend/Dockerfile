FROM python:3.11-slim

WORKDIR /app

# Create and activate virtual environment to prevent root installer warnings
ENV VIRTUAL_ENV=/opt/venv
RUN python -m venv $VIRTUAL_ENV
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Environment variables for memory management
ENV MALLOC_ARENA_MAX=2
ENV PYTHONMALLOC=malloc

EXPOSE 8000

# Run with -O flag for bytecode optimization and limit to 1 worker for 512MB RAM
# Use sh -c to expand the PORT environment variable provided by Render
CMD ["sh", "-c", "python -O -m uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
