import datetime

TITLE = "Fake Métropole"
DESCRIPTION = "Test source: an INSEE code and an address"
URL = None
COUNTRY = "fr"

PARAM_TRANSLATIONS = {
    "en": {"insee_code": "INSEE Code", "street": "Street", "zone": "Zone"},
    "fr": {"insee_code": "Code INSEE", "street": "Rue", "zone": "Secteur"},
}


class Entry:
    def __init__(self, date, type, icon=None):
        self.date = date
        self.type = type
        self.icon = icon


class Source:
    def __init__(self, insee_code, street, house_number=None, zone=None, **kwargs):
        self._args = {"insee_code": insee_code, "street": street, "house_number": house_number,
                      "zone": zone, **kwargs}

    def fetch(self):
        # The arguments it got, as the waste type: the tests read them back.
        described = ";".join(f"{key}={value}" for key, value in sorted(self._args.items()) if value)
        return [Entry(datetime.date(2026, 10, 16), described)]
