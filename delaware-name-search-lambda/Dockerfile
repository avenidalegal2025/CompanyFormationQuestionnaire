FROM --platform=linux/amd64 public.ecr.aws/lambda/python:3.9

# Install system dependencies (based on EC2 working environment)
RUN yum update -y && \
    yum install -y \
    # Basic tools
    curl wget tar gzip bzip2 \
    # X11 and display libraries
    libX11 libXext libXrender libXrandr libXinerama libXcursor libXcomposite libXdamage libXfixes libXi libXtst \
    # GTK and GUI libraries
    gtk3 atk cairo pango gdk-pixbuf2 \
    # Audio libraries
    alsa-lib \
    # D-Bus libraries
    dbus-glib dbus-libs \
    # Font libraries
    fontconfig \
    # Other dependencies
    mesa-libgbm libdrm \
    # Virtual display
    xorg-x11-server-Xvfb \
    # Network libraries
    nss \
    # Development tools for building
    gcc gcc-c++ make \
    && yum clean all && rm -rf /var/cache/yum

# Install Firefox ESR (stable version)
ENV FIREFOX_VERSION=115.15.0esr
RUN curl -L -o /tmp/firefox.tar.bz2 "https://download-installer.cdn.mozilla.net/pub/firefox/releases/${FIREFOX_VERSION}/linux-x86_64/en-US/firefox-${FIREFOX_VERSION}.tar.bz2" && \
    mkdir -p /opt && \
    tar -xjf /tmp/firefox.tar.bz2 -C /opt && \
    ln -sf /opt/firefox/firefox /usr/local/bin/firefox && \
    chmod +x /usr/local/bin/firefox && \
    rm -f /tmp/firefox.tar.bz2

# Install geckodriver (same version as working EC2: 0.34.0)
RUN curl -L https://github.com/mozilla/geckodriver/releases/download/v0.34.0/geckodriver-v0.34.0-linux64.tar.gz | tar -xz -C /usr/local/bin && \
    chmod +x /usr/local/bin/geckodriver

# Set environment variables for writable cache/home directories
ENV XDG_CACHE_HOME=/tmp
ENV HOME=/tmp
ENV GECKODRIVER_LOG=/dev/null
ENV DISPLAY=:99
ENV MOZ_HEADLESS=1

# Copy requirements and install Python packages
COPY requirements.txt /var/task/requirements.txt
RUN pip install -r /var/task/requirements.txt

# Copy the Lambda function code
COPY simple_lambda.py /var/task

# Set the CMD to your handler
CMD ["simple_lambda.lambda_handler"]