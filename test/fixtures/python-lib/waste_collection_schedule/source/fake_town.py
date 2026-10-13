import datetime

from waste_collection_schedule.exceptions import SourceArgumentNotFoundWithSuggestions

TITLE = "Fake Town"
DESCRIPTION = "Test source"
URL = None


class Entry:
    def __init__(self, date, type, icon=None):
        self.date = date
        self.type = type
        self.icon = icon


class Source:
    def __init__(self, city, street=None, *, fail=False):
        self._city = city
        self._fail = fail

    def fetch(self):
        if self._city not in ("Springfield", "Shelbyville"):
            raise SourceArgumentNotFoundWithSuggestions("city", self._city, ["Springfield", "Shelbyville"])
        if self._fail:
            raise ConnectionError("server down")
        return [
            Entry(datetime.date(2026, 10, 16), " Recycling ", "mdi:recycle"),
            Entry(datetime.datetime(2026, 10, 19, 6, 0), "Residual"),
            Entry(datetime.date(2026, 10, 20), ""),
        ]
