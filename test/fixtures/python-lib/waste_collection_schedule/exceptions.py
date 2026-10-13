class SourceArgumentExceptionMultiple(Exception):
    def __init__(self, arguments, message):
        self._arguments = arguments
        self.message = message
        super().__init__(message)

    @property
    def arguments(self):
        return self._arguments


class SourceArgumentException(Exception):
    def __init__(self, argument, message):
        self._argument = argument
        self.message = message
        super().__init__(message)

    @property
    def argument(self):
        return self._argument


class SourceArgumentNotFoundWithSuggestions(SourceArgumentException):
    def __init__(self, argument, value, suggestions):
        super().__init__(argument, f"{argument} '{value}' not found")
        self._suggestions = suggestions

    @property
    def suggestions(self):
        return self._suggestions
