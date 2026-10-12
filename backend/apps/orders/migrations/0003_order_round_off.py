from decimal import Decimal

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("orders", "0002_remove_order_ck_order_table_matches_type_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="order",
            name="round_off",
            field=models.DecimalField(decimal_places=2, default=Decimal("0"), max_digits=12),
        ),
    ]
