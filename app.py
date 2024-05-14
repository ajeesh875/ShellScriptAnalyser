from flask import Flask, render_template, request
from config.config import SCANNERS
from modules.constants import UPLOAD_FOLDER
import os

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/scan', methods=['POST'])
def scan():
    results = []
    if 'file' in request.files:
        file = request.files['file']
        if file.filename:
            # Iterate over all available scanners
            for scanner_class in SCANNERS.values():
                scanner = scanner_class()
                results.extend(scan_file(file, scanner))
    elif 'project' in request.files:
        project = request.files['project']
        if project.filename:
            results.extend(scan_project(project))
    return render_template('results.html', results=results)

def scan_file(file, scanner):
    return scanner.scan(file)

def scan_project(project):
    results = []
    # Iterate over all files in the project directory
    project_folder = app.config['UPLOAD_FOLDER']
    for filename in os.listdir(project_folder):
        if filename.endswith('.sh'):  # Assuming shell scripts only for simplicity
            filepath = os.path.join(project_folder, filename)
            with open(filepath, 'rb') as f:
                for scanner_class in SCANNERS.values():
                    scanner = scanner_class()
                    results.extend(scan_file(f, scanner))
    return results

if __name__ == '__main__':
    app.run(debug=True)
