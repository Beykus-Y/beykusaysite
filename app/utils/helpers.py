import re

def validate_email(email):
    """Простая валидация email."""
    if not email or not re.match(r'^[^\s@]+@[^\s@]+\.[^\s@]+$', email):
        return False
    return True

def validate_password(password):
    """Простая валидация пароля."""
    if not password or len(password) < 6:
        return False
    return True

def validate_name(name):
    """Простая валидация имени."""
    if not name or len(name.strip()) < 2:
        return False
    return True