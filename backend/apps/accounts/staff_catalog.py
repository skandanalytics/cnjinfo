"""Department, role, and designation combinations already used by the employee form.

Unknown department text is left alone so older records and tests keep working.
"""

CASHIER_BILL_DUTIES = {
    "counter_payment": "Record counter payment",
    "print_bill": "Print and preview bills",
}

# department -> allowed roles -> designations
CATALOG = {
    "Dining Floor": {
        "STAFF": ["Steward", "Head Steward"],
    },
    "Kitchen": {
        "CHEF": ["Chef", "Head Chef", "Cook"],
    },
    "Billing & POS": {
        "CASHIER": ["Cashier", "Billing Executive"],
    },
    "Logistics": {
        "STAFF": ["Delivery Staff"],
    },
    "Management": {
        "MANAGER": ["Branch Manager"],
        "ADMIN": ["Restaurant Administrator"],
        "SUPER_ADMIN": ["Owner", "Super Administrator", "General Manager"],
    },
}


def parse_bill_access(value):
    if not value:
        return []
    return [part.strip() for part in str(value).split(",") if part.strip()]


def validate_assignment(department, role, job_title, bill_access):
    """Return an error dict, or None when the combination is acceptable."""
    if role == "SUPER_ADMIN":
        return None
    if department not in CATALOG:
        return None
    roles = CATALOG[department]
    if role not in roles:
        return {"role": "This role is not available for the selected department."}
    if job_title:
        own = set(roles[role])
        foreign = set()
        for dept, role_map in CATALOG.items():
            for other_role, titles in role_map.items():
                if dept == department and other_role == role:
                    continue
                foreign.update(titles)
        if job_title in foreign and job_title not in own:
            return {"job_title": "This designation belongs to a different department or role."}
    duties = parse_bill_access(bill_access)
    if role == "CASHIER":
        unknown = [d for d in duties if d not in CASHIER_BILL_DUTIES]
        if unknown:
            return {"bill_access": "Unknown cashier bill option."}
    elif duties:
        return {"bill_access": "Bill options apply only to the Cashier role."}
    return None
