# config.py
from modules.scanners.hardcoded_credentials_scanner import HardcodedCredentialsScanner
# Map vulnerability types to their respective scanner classes
SCANNERS = {
    'hardcoded_credentials': HardcodedCredentialsScanner,
    #'injection': InjectionScanner,
    #'path_traversal': PathTraversalScanner,
    # Add more scanners as needed
}
