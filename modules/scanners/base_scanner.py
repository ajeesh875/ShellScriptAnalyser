# modules/scanners/base_scanner.py
from abc import ABC, abstractmethod
from configparser import ConfigParser

class BaseScanner(ABC):
    def __init__(self):
        self.config = self.load_config()

    def load_config(self):
        config = ConfigParser()
        config.read('config/config.ini')
        return config
