from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('menu', '0003_food_image_url'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='food',
            name='protein_grams',
        ),
    ]
