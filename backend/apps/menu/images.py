"""One rule for a dish's display image, shared by the staff API, the public menu and cart lines."""


def uploaded_url(request, img):
    return request.build_absolute_uri(img.image.url) if request is not None else img.image.url


def display_image(food, request=None):
    """The admin-supplied URL if there is one, else the primary uploaded file, else None (no placeholder)."""
    if food.image_url:
        return food.image_url
    imgs = list(food.images.all())  # model ordering puts the primary first
    return uploaded_url(request, imgs[0]) if imgs else None
