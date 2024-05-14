# modules/scanners/hardcoded_credentials_scanner.py
import re  # Import the re module for regular expressions
from .base_scanner import BaseScanner

class HardcodedCredentialsScanner(BaseScanner):
    def scan(self, file):
        results = []
        credential_patterns = self.config['HardcodedCredentials']
        for line_number, line in enumerate(file, start=1):
            if self.contains_hardcoded_credentials(line, credential_patterns):
                results.append((file.filename, line_number, line.strip()))
        return results

    def contains_hardcoded_credentials(self, line, credential_patterns):
        for pattern in credential_patterns.values():
            if pattern and self.regex_search(pattern, line):
                return True
        return False

    def regex_search(self, pattern, line):
        line = line.decode('utf-8') if isinstance(line, bytes) else line  # Decode bytes to string if necessary
        return re.search(pattern, line, re.IGNORECASE)
