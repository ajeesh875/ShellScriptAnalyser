from flask import Flask, render_template, request
from config.config import SCANNERS
from modules.constants import UPLOAD_FOLDER
import os
import re
import configparser

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

class HardcodedCredentialsScanner:
    def __init__(self):
        self.config = {}
        self.load_patterns_from_config()

    def load_patterns_from_config(self):
        config = configparser.ConfigParser()
        config.read(os.path.join(app.root_path, 'config', 'config.ini'))
        self.config['HardcodedCredentials'] = {
            key: config['HardcodedCredentials'][key]
            for key in config['HardcodedCredentials']
        }

    def scan(self, file_content):
        results = []
        credential_patterns = self.config.get('HardcodedCredentials', {})
        for line_number, line in enumerate(file_content, start=1):
            if self.contains_hardcoded_credentials(line, credential_patterns):
                results.append((line_number, line.strip()))
        return results

    def contains_hardcoded_credentials(self, line, credential_patterns):
        for pattern in credential_patterns.values():
            if pattern and self.regex_search(pattern, line):
                return True
        return False

    def regex_search(self, pattern, line):
        line = line.decode('utf-8') if isinstance(line, bytes) else line
        return re.search(pattern, line, re.IGNORECASE)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload():
    results = []
    if 'fileUpload' in request.files:
        file = request.files['fileUpload']
        if file.filename:
            file_path = os.path.join(app.config['UPLOAD_FOLDER'], file.filename)
            file.save(file_path)
            # Perform the scan
            scanner = HardcodedCredentialsScanner()
            with open(file_path, 'r') as f:
                results = scanner.scan(f.readlines())
    return render_template('results.html', results=results)

if __name__ == '__main__':
    app.run(debug=True)
