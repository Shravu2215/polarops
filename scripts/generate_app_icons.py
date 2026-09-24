import os
import math
from PIL import Image, ImageDraw

def create_polarops_icon():
    size = 1024
    img = Image.new("RGBA", (size, size), (230, 244, 254, 255)) # #E6F4FE Ice Blue
    draw = ImageDraw.Draw(img)

    center = size / 2.0
    
    # Outer ring (Polar compass border)
    outer_radius = 380
    draw.ellipse(
        [center - outer_radius, center - outer_radius, center + outer_radius, center + outer_radius],
        outline=(2, 132, 199, 255), # #0284C7 Polar Blue
        width=24
    )

    # Inner ring
    inner_radius = 280
    draw.ellipse(
        [center - inner_radius, center - inner_radius, center + inner_radius, center + inner_radius],
        outline=(15, 23, 42, 255), # #0F172A Dark Navy
        width=12
    )

    # 8-Point Snowflake / Compass Star Rays
    angles = [0, 45, 90, 135, 180, 225, 270, 315]
    for angle in angles:
        rad = math.radians(angle)
        # Main axis ray
        length = 340 if angle % 90 == 0 else 240
        x_end = center + length * math.cos(rad)
        y_end = center + length * math.sin(rad)

        color = (2, 132, 199, 255) if angle % 90 == 0 else (15, 23, 42, 255)
        width = 20 if angle % 90 == 0 else 12

        draw.line([center, center, x_end, y_end], fill=color, width=width)

        # Snowflake branches on main axes (0, 90, 180, 270)
        if angle % 90 == 0:
            branch_dist = 220
            branch_len = 60
            bx = center + branch_dist * math.cos(rad)
            by = center + branch_dist * math.sin(rad)

            for b_angle in [angle + 45, angle - 45]:
                brad = math.radians(b_angle)
                bx_end = bx + branch_len * math.cos(brad)
                by_end = by + branch_len * math.sin(brad)
                draw.line([bx, by, bx_end, by_end], fill=(2, 132, 199, 255), width=14)

    # Center Hub Diamond / Core
    core_r = 70
    draw.ellipse(
        [center - core_r, center - core_r, center + core_r, center + core_r],
        fill=(15, 23, 42, 255)
    )
    
    draw.ellipse(
        [center - 30, center - 30, center + 30, center + 30],
        fill=(230, 244, 254, 255)
    )

    return img

def create_android_foreground():
    size = 1024
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0)) # Transparent
    draw = ImageDraw.Draw(img)

    center = size / 2.0
    outer_radius = 280

    draw.ellipse(
        [center - outer_radius, center - outer_radius, center + outer_radius, center + outer_radius],
        outline=(2, 132, 199, 255),
        width=20
    )

    angles = [0, 45, 90, 135, 180, 225, 270, 315]
    for angle in angles:
        rad = math.radians(angle)
        length = 260 if angle % 90 == 0 else 180
        x_end = center + length * math.cos(rad)
        y_end = center + length * math.sin(rad)
        color = (2, 132, 199, 255) if angle % 90 == 0 else (15, 23, 42, 255)
        draw.line([center, center, x_end, y_end], fill=color, width=16)

    draw.ellipse(
        [center - 50, center - 50, center + 50, center + 50],
        fill=(15, 23, 42, 255)
    )

    return img

def generate_all_assets():
    target_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "mobile", "assets"))
    os.makedirs(target_dir, exist_ok=True)

    print(f"[+] Generating PolarOps app assets in {target_dir}...")

    # Main icon.png
    icon_img = create_polarops_icon()
    icon_img.save(os.path.join(target_dir, "icon.png"))
    icon_img.save(os.path.join(target_dir, "splash-icon.png"))

    # Android background & foreground
    bg_img = Image.new("RGBA", (1024, 1024), (230, 244, 254, 255))
    bg_img.save(os.path.join(target_dir, "android-icon-background.png"))

    fg_img = create_android_foreground()
    fg_img.save(os.path.join(target_dir, "android-icon-foreground.png"))
    fg_img.save(os.path.join(target_dir, "android-icon-monochrome.png"))

    # Favicon
    fav_img = icon_img.resize((48, 48), Image.Resampling.LANCZOS)
    fav_img.save(os.path.join(target_dir, "favicon.png"))

    print("[SUCCESS] App icons and splash screen successfully updated!")

if __name__ == "__main__":
    generate_all_assets()
