from apps.orders.management.commands.runserver_lan import Command as LanRunserverCommand

class Command(LanRunserverCommand):
    """
    Foodie development server command.
    Automatically displays database status and LAN API URLs upon startup.
    """
    pass
