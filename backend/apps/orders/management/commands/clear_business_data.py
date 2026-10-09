"""Clear transactional Foodie data without dropping the schema.

Keeps the application usable: branches, table views, employees, admin accounts,
menu, inventory quantities, and coupon definitions stay in place.

Deletes, in dependency order:
  payment events, payments, invoices, coupon redemptions, order status history,
  order items, orders, cart items, carts, stock transactions, OTP requests,
  and audit log rows. Dining tables are set back to AVAILABLE.

Usage (from the backend directory):
  .venv\\Scripts\\python manage.py clear_business_data
  .venv\\Scripts\\python manage.py clear_business_data --confirm

The first form is a dry run and deletes nothing. --confirm runs the deletes
inside one transaction. This command never runs on startup.
"""
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.accounts.models import OTPRequest
from apps.audit.models import AuditLog
from apps.billing.models import Invoice
from apps.branches.models import DiningTable
from apps.carts.models import Cart, CartItem
from apps.coupons.models import CouponRedemption
from apps.inventory.models import StockTransaction
from apps.orders.models import Order, OrderItem, OrderStatusHistory
from apps.payments.models import Payment, PaymentEvent


class Command(BaseCommand):
    help = "Preview or delete transactional orders, payments, carts, and related rows."

    def add_arguments(self, parser):
        parser.add_argument(
            "--confirm",
            action="store_true",
            help="Delete the rows. Without this flag the command only prints counts.",
        )

    def handle(self, *args, **options):
        steps = [
            ("payment events", PaymentEvent.objects.all()),
            ("payments", Payment.objects.all()),
            ("invoices", Invoice.objects.all()),
            ("coupon redemptions", CouponRedemption.objects.all()),
            ("order status history", OrderStatusHistory.objects.all()),
            ("order items", OrderItem.objects.all()),
            ("orders", Order.objects.all()),
            ("cart items", CartItem.objects.all()),
            ("carts", Cart.objects.all()),
            ("stock transactions", StockTransaction.objects.all()),
            ("OTP requests", OTPRequest.objects.all()),
            ("audit log", AuditLog.objects.all()),
        ]
        occupied = DiningTable.objects.exclude(status=DiningTable.Status.AVAILABLE).count()
        self.stdout.write("Scope: transactional data only. Branches, staff, menu, coupons, and stock levels are kept.")
        for label, qs in steps:
            self.stdout.write(f"  {label}: {qs.count()}")
        self.stdout.write(f"  tables reset to AVAILABLE: {occupied}")
        if not options["confirm"]:
            self.stdout.write(self.style.WARNING("Dry run. Re-run with --confirm to delete these rows."))
            return
        try:
            with transaction.atomic():
                for label, qs in steps:
                    deleted, _ = qs.delete()
                    self.stdout.write(f"Deleted {label}: {deleted}")
                updated = DiningTable.objects.exclude(status=DiningTable.Status.AVAILABLE).update(
                    status=DiningTable.Status.AVAILABLE)
                self.stdout.write(f"Tables set to AVAILABLE: {updated}")
        except Exception as exc:
            raise CommandError(f"Cleanup failed and was rolled back: {exc}") from exc
        self.stdout.write(self.style.SUCCESS("Transactional data cleared."))
