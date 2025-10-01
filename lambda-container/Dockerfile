FROM --platform=linux/amd64 public.ecr.aws/lambda/python:3.9

# Install basic tools and runtime libraries required by Firefox headless
RUN yum update -y && \
    yum install -y tar gzip bzip2 curl ca-certificates \
      gtk3 at-spi2-atk atk cairo pango gdk-pixbuf2 \
      libX11 libXcomposite libXcursor libXdamage libXext libXi libXfixes libXrandr libXrender libXtst \
      mesa-libgbm libdrm xorg-x11-server-Xvfb dbus-libs cups-libs \
      xorg-x11-xauth xorg-x11-utils && \
    yum clean all && rm -rf /var/cache/yum

# Install Firefox ESR (tarball) to /opt/firefox and symlink into PATH
ENV FIREFOX_VERSION=115.15.0esr
RUN curl -L -o /tmp/firefox.tar.bz2 https://download-installer.cdn.mozilla.net/pub/firefox/releases/${FIREFOX_VERSION}/linux-x86_64/en-US/firefox-${FIREFOX_VERSION}.tar.bz2 && \
    mkdir -p /opt && \
    tar -xjf /tmp/firefox.tar.bz2 -C /opt && \
    ln -sf /opt/firefox/firefox /usr/local/bin/firefox && \
    rm -f /tmp/firefox.tar.bz2

# Install geckodriver
RUN curl -L https://github.com/mozilla/geckodriver/releases/download/v0.34.0/geckodriver-v0.34.0-linux64.tar.gz | tar -xz -C /usr/local/bin && \
    chmod +x /usr/local/bin/geckodriver

# Copy requirements and install Python dependencies
COPY requirements.txt ${LAMBDA_TASK_ROOT}
RUN pip install -r requirements.txt

# Copy function code
COPY check_company_availability.py ${LAMBDA_TASK_ROOT}

# Set the CMD to your handler
CMD [ "check_company_availability.lambda_handler" ]
