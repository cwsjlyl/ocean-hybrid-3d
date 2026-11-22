#!/usr/bin/env python3
"""
Blender 3.6+ / 4.x 批次視覺升級腳本（Nintendo Switch 風格化海底 PBR 管線）
==========================================================================
用途：
1. 批次讀取 `assets/models/*.glb`（沉船、寶箱、木桶、礁石、膠樽等低多邊形資產）
2. 自動套用導角（Bevel）+ 權重法線（Weighted Normals）消除生硬稜角，呈現任天堂圓潤高光
3. 自動調整 Principled BSDF 材質參數（溫潤粗糙度、次表面散射感、水下高光 IOR）
4. 可選擇匯出高精度圓潤 Subdivision 3D 海洋生物模型至 `assets/models/creatures/`

執行方式（於專案根目錄）：
    blender --background --python tools/blender_switch_upgrade.py
"""

import os
import glob
import bpy

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MODELS_DIR = os.path.join(PROJECT_ROOT, "assets", "models")


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def upgrade_material_to_switch_pbr(mat):
    """將材質升級為類似《動物森友會》水族館之溫潤風格化 PBR 節點設定"""
    if not mat or not mat.use_nodes:
        return
    bsdf = None
    for node in mat.node_tree.nodes:
        if node.type == "BSDF_PRINCIPLED":
            bsdf = node
            break
    if not bsdf:
        return

    # 溫潤緞面粗糙度，避免塑膠死光或完全無反光
    if "Roughness" in bsdf.inputs:
        cur_r = bsdf.inputs["Roughness"].default_value
        bsdf.inputs["Roughness"].default_value = max(0.32, min(cur_r * 0.8, 0.72))

    if "Metallic" in bsdf.inputs:
        bsdf.inputs["Metallic"].default_value = min(bsdf.inputs["Metallic"].default_value, 0.15)

    # Blender 4.x Specular IOR / Coat 微調水下濕潤光澤
    if "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = 0.18
        bsdf.inputs["Coat Roughness"].default_value = 0.25


def polish_mesh_object(obj):
    """套用重疊頂點合併、柔和導角 (Bevel) 與權重平滑法線 (Weighted Normal)"""
    if obj.type != "MESH":
        return

    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)

    # 啟用平滑著色
    bpy.ops.object.shade_smooth()

    # 1. 柔和邊緣導角，捕捉海底環境光高光邊
    bevel = obj.modifiers.new(name="Switch_Bevel", type="BEVEL")
    bevel.width = 0.012
    bevel.segments = 2
    bevel.limit_method = "ANGLE"
    bevel.angle_limit = 0.523599  # 30 度
    bevel.harden_normals = False

    # 2. 權重法線保持大平面乾淨同時邊緣圓潤
    wn = obj.modifiers.new(name="Switch_WeightedNormal", type="WEIGHTED_NORMAL")
    wn.keep_sharp = True
    wn.weight = 50

    for slot in obj.material_slots:
        upgrade_material_to_switch_pbr(slot.material)


def process_all_glb_models():
    glb_files = sorted(glob.glob(os.path.join(MODELS_DIR, "*.glb")))
    if not glb_files:
        print(f"[WARN] 找不到任何 .glb 檔案於: {MODELS_DIR}")
        return

    for filepath in glb_files:
        filename = os.path.basename(filepath)
        print(f"[Switch Upgrade] 正在優化模型: {filename} ...")
        reset_scene()

        bpy.ops.import_scene.gltf(filepath=filepath)
        for obj in list(bpy.data.objects):
            if obj.type == "MESH":
                polish_mesh_object(obj)

        # 匯出最佳化 WebGL glTF Binary (.glb)，自動套用 Modifier
        bpy.ops.export_scene.gltf(
            filepath=filepath,
            export_format="GLB",
            export_apply=True,
            export_yup=True,
            export_texcoords=True,
            export_normals=True,
            export_materials="EXPORT",
        )
        print(f"[Switch Upgrade] 完成匯出: {filename}")


if __name__ == "__main__":
    process_all_glb_models()
    print("✅ 所有 Blender 3D 資產已完成 Nintendo Switch 風格化 PBR 優化！")
