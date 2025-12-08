#!/bin/bash
# Merge coordinate overlay with local SS-4 template

TEMPLATE_PATH=""
OVERLAY_PATH="test-results/ss4_coordinate_overlay.pdf"
OUTPUT_PATH="test-results/ss4_with_coordinates.pdf"

# Check if template exists in common locations
if [ -f "test-results/ss4_template.pdf" ]; then
    TEMPLATE_PATH="test-results/ss4_template.pdf"
elif [ -f "fss4.pdf" ]; then
    TEMPLATE_PATH="fss4.pdf"
elif [ -f "ss4_template.pdf" ]; then
    TEMPLATE_PATH="ss4_template.pdf"
else
    echo "❌ SS-4 template PDF not found"
    echo ""
    echo "💡 Please do one of the following:"
    echo "   1. Download the template from S3 (requires AWS credentials):"
    echo "      aws s3 cp s3://ss4-template-bucket-043206426879/fss4.pdf test-results/ss4_template.pdf"
    echo ""
    echo "   2. Or place your SS-4 template PDF in one of these locations:"
    echo "      - test-results/ss4_template.pdf"
    echo "      - fss4.pdf (project root)"
    echo "      - ss4_template.pdf (project root)"
    echo ""
    echo "   3. Or provide the path:"
    echo "      ./scripts/merge-with-local-template.sh /path/to/your/ss4_template.pdf"
    exit 1
fi

# If path provided as argument, use it
if [ -n "$1" ] && [ -f "$1" ]; then
    TEMPLATE_PATH="$1"
fi

if [ ! -f "$TEMPLATE_PATH" ]; then
    echo "❌ Template not found: $TEMPLATE_PATH"
    exit 1
fi

if [ ! -f "$OVERLAY_PATH" ]; then
    echo "❌ Overlay not found: $OVERLAY_PATH"
    echo "💡 Run: python3 scripts/verify-ss4-coordinates.py"
    exit 1
fi

echo "🔗 Merging template with coordinate overlay..."
echo "   Template: $TEMPLATE_PATH"
echo "   Overlay:  $OVERLAY_PATH"
echo "   Output:   $OUTPUT_PATH"

python3 scripts/merge-overlay-simple.py "$TEMPLATE_PATH" "$OVERLAY_PATH" "$OUTPUT_PATH"

if [ $? -eq 0 ] && [ -f "$OUTPUT_PATH" ]; then
    echo ""
    echo "✅ Success! Opening merged PDF..."
    open "$OUTPUT_PATH"
else
    echo ""
    echo "❌ Merge failed"
    exit 1
fi

