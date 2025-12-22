#!/usr/bin/env python3
"""
Generate mytab icons in multiple sizes
"""
from PIL import Image, ImageDraw
import os

# 创建图标目录
icon_dir = '/home/engine/project/icons'
os.makedirs(icon_dir, exist_ok=True)

def create_icon(size):
    # 创建新图像：圆角方形，蓝色渐变背景
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # 计算圆角半径
    corner_radius = size // 8
    
    # 定义蓝色渐变
    start_color = (30, 64, 175)  # #1e40af
    end_color = (59, 130, 246)   # #3b82f6
    
    # 绘制渐变背景
    for y in range(size):
        ratio = y / size
        r = int(start_color[0] + (end_color[0] - start_color[0]) * ratio)
        g = int(start_color[1] + (end_color[1] - start_color[1]) * ratio)
        b = int(start_color[2] + (end_color[2] - start_color[2]) * ratio)
        
        # 先绘制整行的颜色
        draw.line([(0, y), (size, y)], fill=(r, g, b, 255))
    
    # 将圆角外部的像素设置为透明
    pixels = img.load()
    for x in range(size):
        for y in range(size):
            # 左上角圆角
            if x < corner_radius and y < corner_radius:
                if ((x - corner_radius)  ** 2 + (y - corner_radius) **  2)  ** 0.5 > corner_radius:
                    pixels[x, y] = (0, 0, 0, 0)
            # 右上角圆角
            elif x >= size - corner_radius and y < corner_radius:
                if ((x - (size - corner_radius)) ** 2 + (y - corner_radius) **  2) **  0.5 > corner_radius:
                    pixels[x, y] = (0, 0, 0, 0)
            # 左下角圆角
            elif x < corner_radius and y >= size - corner_radius:
                if ((  x - corner_radius) ** 2 + (y - (size - corner_radius)) ** 2) ** 0.5 > corner_radius:
                    pixels[x, y] = (0, 0, 0, 0)
            # 右下角圆角
            elif x >= size - corner_radius and y >= size - corner_radius:
                if (((x - (size - corner_radius)) ** 2) + ((y - (size - corner_radius)) ** 2)) ** 0.5 > corner_radius:
                    pixels[x, y] = (0, 0, 0, 0)
    
    # 绘制白色M字母
    margin = size * 0.15  # 上下左右的边距
    left_x = margin
    right_x = size - margin
    bottom_y = size - margin
    top_y = margin + size * 0.16  # 调整顶部位置
    mid_y = bottom_y - size * 0.12
    center_x = size / 2
    v_bottom_y = mid_y
    
    # M的顶点坐标
    left_top = (left_x, top_y)
    left_bottom = (left_x, bottom_y)
    right_top = (right_x, top_y)
    right_bottom = (right_x, bottom_y)
    v_bottom = (center_x, v_bottom_y)
    
    # M是一个多边形，填充白色
    m_points = [left_top, left_bottom, v_bottom, right_bottom, right_top]
    draw.polygon(m_points, fill=(255, 255, 255, 255))
    
    return img

# 生成所有尺寸的图标
for size in [16, 32, 48, 128]:
    icon = create_icon(size)
    icon.save(f'{icon_dir}/mytab-{size}.png')
    print(f'Created: icons/mytab-{size}.png')

print('\nAll icons generated successfully!')
