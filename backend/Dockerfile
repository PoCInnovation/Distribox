FROM python:3.9 as base

RUN apt-get update && apt-get install -y \
    qemu-utils \
    libvirt-dev \
    && rm -rf /var/lib/apt/lists/*

FROM base as builder
WORKDIR /code
COPY ./requirements.txt /code/requirements.txt
RUN pip install --no-cache-dir --upgrade -r /code/requirements.txt

FROM builder as dev-stage
COPY ./app /code/app
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--reload"]

FROM builder as production-stage
COPY ./app /code/app
CMD ["fastapi", "run", "app/main.py", "--port", "8080"]
