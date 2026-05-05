FROM python:3.12-bookworm

# pyudev needs libudev (already in bookworm). Keep image small.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libudev1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY pyproject.toml ./
RUN pip install --no-cache-dir .

COPY photowall_watcher ./photowall_watcher

# State volume mountpoint
RUN mkdir -p /var/lib/photowall-watcher

ENV PYTHONUNBUFFERED=1
EXPOSE 8080

CMD ["python", "-m", "photowall_watcher"]
