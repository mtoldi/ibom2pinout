from flask import Flask, render_template, request, jsonify
import os
import re
from lzstring import LZString
import json

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_file():
    file = request.files.get('file')
    if not file or not file.filename.endswith('.html'):
        return jsonify({'status': 'error', 'message': 'Invalid file type.'}), 400

    content = file.read().decode('utf-8')
    match = re.search(r'var\s+pcbdata\s*=\s*JSON\.parse\(LZString\.decompressFromBase64\("([^"]+)"\)', content)
    if not match:
        return jsonify({'status': 'error', 'message': 'pcbdata not found in file.'}), 400

    compressed_data = match.group(1)
    lz = LZString()
    try:
        json_data = lz.decompressFromBase64(compressed_data)
        pcbdata = json.loads(json_data)
        print("PCB Keys:", pcbdata.keys())
        print("Footprints sample:", pcbdata.get("footprints", [])[:3])

        return jsonify({
            'status': 'ok',
            'drawings': pcbdata.get("drawings", {}),
            'footprints': pcbdata.get("footprints", []),  # <-- ispravljeno ovdje
            'edges': pcbdata.get("edges", []),
            'metadata': pcbdata.get("metadata", {}),
            'bom': pcbdata.get("bom", {}),
            'edges_bbox': pcbdata.get("edges_bbox", {})
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': f'Error parsing JSON: {str(e)}'}), 500

if __name__ == '__main__':
    app.run(debug=True)
