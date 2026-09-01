# Playwright's own image already carries Chromium plus every system library it
# needs; the AWS Python base image does not, and installing them on AL2023 is
# far more fragile than adding the Lambda runtime interface client here.
FROM mcr.microsoft.com/playwright/python:v1.58.0-noble-amd64

ENV PYTHONUNBUFFERED=1 \
    HOME=/tmp \
    XDG_CACHE_HOME=/tmp \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

RUN pip install --no-cache-dir awslambdaric==2.2.1 playwright==1.58.0

WORKDIR /var/task
COPY lambda_function.py /var/task/

ENTRYPOINT ["python", "-m", "awslambdaric"]
CMD ["lambda_function.lambda_handler"]
