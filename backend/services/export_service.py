"""
Lumina AI v4.0 — Export Service
PDF, Excel, HTML, and Jupyter Notebook export.
Professional dashboard formatting with branded themes and auto-generated charts.
"""

from __future__ import annotations

import io
import json
import gc
from datetime import datetime
from typing import Any, TYPE_CHECKING
from loguru import logger

if TYPE_CHECKING:
    import numpy as np
    import pandas as pd

from models import FullAnalysisResult


# Recursively convert numpy types to native Python for JSON serialization.
def _clean_for_json(obj):
    import numpy as np
    if isinstance(obj, dict):
        return {k: _clean_for_json(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_clean_for_json(i) for i in obj]
    elif isinstance(obj, (np.integer,)):
        return int(obj)
    elif isinstance(obj, (np.floating,)):
        return float(obj)
    elif isinstance(obj, (np.ndarray,)):
        return obj.tolist()
    elif isinstance(obj, (np.bool_,)):
        return bool(obj)
    return obj


import zipfile


# ── Brand color palette ────────────────────────────────────────
BRAND = {
    "bg_dark": "#07090F",
    "bg_card": "#0F1117",
    "border": "#1E2333",
    "cyan": "#00E5FF",
    "purple": "#7B2FFF",
    "green": "#00FF87",
    "red": "#FF3D57",
    "amber": "#FFB800",
    "pink": "#FF6B9D",
    "teal": "#36D7B7",
    "text": "#E8ECF4",
    "muted": "#6B7280",
    "palette": ["#00E5FF", "#7B2FFF", "#00FF87", "#FF3D57", "#FFB800", "#FF6B9D", "#36D7B7", "#A855F7"],
}


class ExportService:
    """Generates export files in multiple formats."""

    # ═══════════════════════════════════════════════════════════════
    # EXCEL EXPORT — Professional Dashboard
    # ═══════════════════════════════════════════════════════════════

    async def export_excel(
        self, df: pd.DataFrame, analysis: FullAnalysisResult, advanced: bool = False, custom_charts: list[dict] = None
    ) -> bytes:
        """Generate multi-sheet Excel workbook with professional dashboard formatting."""
        import pandas as pd
        import numpy as np
        import xlsxwriter.utility as xlsx_util
        logger.info(f"Generating Excel export (advanced={advanced})")
        output = io.BytesIO()

        # Detect column categories
        num_cols = df.select_dtypes('number').columns.tolist()
        cat_cols = df.select_dtypes(include=['object', 'category']).columns.tolist()
        date_cols = df.select_dtypes(include=['datetime', 'datetime64']).columns.tolist()

        with pd.ExcelWriter(output, engine="xlsxwriter") as writer:
            # ── Sheet 1: Data (with formatting) ──────────────────
            df.head(10000).to_excel(writer, sheet_name="Data", index=False)
            workbook = writer.book
            data_ws = writer.sheets["Data"]

            # Convert to official Excel Table (enables Slicers and dynamic filtering)
            max_row = len(df.head(10000))
            max_col = len(df.columns) - 1
            if max_row > 0:
                data_ws.add_table(0, 0, max_row, max_col, {
                    'columns': [{'header': str(c)} for c in df.columns],
                    'name': 'LuminaDataTable',
                    'style': 'Table Style Medium 2'
                })

            # Number formatting per column type
            money_fmt = workbook.add_format({'num_format': '$#,##0.00', 'font_size': 10})
            pct_fmt = workbook.add_format({'num_format': '0.0%', 'font_size': 10})
            num_fmt = workbook.add_format({'num_format': '#,##0.00', 'font_size': 10})
            int_fmt = workbook.add_format({'num_format': '#,##0', 'font_size': 10})
            text_fmt = workbook.add_format({'font_size': 10})

            money_keys = ['price', 'sales', 'revenue', 'cost', 'profit', 'amount', 'salary', 'income', 'fee', 'total']
            pct_keys = ['pct', 'percent', 'rate', 'ratio', 'margin', 'discount']

            for col_num, col_name in enumerate(df.columns):
                col_lower = col_name.lower()
                try:
                    max_len = max(len(str(col_name)), int(df[col_name].astype(str).str.len().max()) if len(df) > 0 else 5)
                except Exception:
                    max_len = len(str(col_name))
                col_width = min(max_len + 2, 30)

                if col_name in num_cols:
                    if any(k in col_lower for k in money_keys):
                        data_ws.set_column(col_num, col_num, col_width, money_fmt)
                    elif any(k in col_lower for k in pct_keys):
                        data_ws.set_column(col_num, col_num, col_width, pct_fmt)
                    elif df[col_name].dtype in ['int64', 'int32', 'Int64']:
                        data_ws.set_column(col_num, col_num, col_width, int_fmt)
                    else:
                        data_ws.set_column(col_num, col_num, col_width, num_fmt)
                else:
                    data_ws.set_column(col_num, col_num, col_width, text_fmt)

            # Freeze header row
            data_ws.freeze_panes(1, 0)

            # ── Data Validation Dropdowns (interactive category filters) ──
            for ci, cc in enumerate(cat_cols[:5]):
                unique_vals = df[cc].dropna().unique()
                if 2 <= len(unique_vals) <= 50:
                    val_list = ','.join(str(v)[:100] for v in sorted(unique_vals)[:50])
                    if len(val_list) < 255:  # Excel validation limit
                        data_ws.data_validation(
                            1, ci, min(len(df), 10000), ci,
                            {'validate': 'list', 'source': val_list.split(','),
                             'input_title': f'Filter: {cc}',
                             'input_message': f'Select a {cc} value to highlight',
                             'error_type': 'information'}
                        )

            # ── Advanced Conditional Formatting ────────────────
            top_fmt = workbook.add_format({'bg_color': '#D1FAE5', 'font_color': '#065F46', 'bold': True})
            bot_fmt = workbook.add_format({'bg_color': '#FEE2E2', 'font_color': '#991B1B'})
            
            for i, nc_name in enumerate(num_cols[:8]):
                nc_idx = df.columns.get_loc(nc_name)
                nc_letter = xlsx_util.xl_col_to_name(nc_idx)
                range_str = f'{nc_letter}2:{nc_letter}{min(len(df)+1, 10001)}'
                
                # Top/Bottom 10% for the top 3 key metrics
                if i < 3:
                    data_ws.conditional_format(range_str, {'type': 'top', 'value': 10, 'format': top_fmt})
                    data_ws.conditional_format(range_str, {'type': 'bottom', 'value': 10, 'format': bot_fmt})
                
                # Standard Data Bar
                data_ws.conditional_format(
                    range_str,
                    {'type': 'data_bar', 'bar_color': '#E0F2FE', 'bar_solid': True}
                )

            if advanced:
                # ── Dashboard Sheet ──────────────────────────────
                dash = workbook.add_worksheet("Dashboard")
                dash.hide_gridlines(2)
                dash.set_tab_color(BRAND["cyan"])

                title_fmt = workbook.add_format({
                    'bold': True, 'font_size': 22, 'font_color': BRAND["cyan"],
                    'valign': 'vcenter'
                })
                subtitle_fmt = workbook.add_format({
                    'font_size': 11, 'font_color': BRAND["muted"],
                    'valign': 'vcenter'
                })
                section_fmt = workbook.add_format({
                    'bold': True, 'font_size': 14, 'font_color': BRAND["cyan"],
                    'bottom': 2, 'bottom_color': BRAND["cyan"]
                })
                kpi_value_fmt = workbook.add_format({
                    'bold': True, 'font_size': 20, 'font_color': BRAND["bg_dark"],
                    'align': 'center', 'valign': 'vcenter',
                    'border': 1, 'border_color': BRAND["border"], 'bg_color': '#F8F9FA'
                })
                kpi_label_fmt = workbook.add_format({
                    'font_size': 9, 'font_color': BRAND["muted"],
                    'align': 'center', 'valign': 'vcenter',
                    'top': 1, 'top_color': BRAND["cyan"], 'bg_color': '#F8F9FA'
                })
                link_fmt = workbook.add_format({
                    'font_color': BRAND["cyan"], 'underline': True, 'font_size': 10
                })
                stat_header_fmt = workbook.add_format({
                    'bold': True, 'font_size': 9, 'font_color': BRAND["cyan"],
                    'border': 1, 'border_color': BRAND["border"],
                    'align': 'center', 'bg_color': '#F8F9FA'
                })
                stat_val_fmt = workbook.add_format({
                    'font_size': 9, 'font_color': BRAND["bg_dark"], 'num_format': '#,##0.00',
                    'border': 1, 'border_color': BRAND["border"],
                    'align': 'right'
                })

                # Add Slicer Hint since xlsxwriter doesn't support them natively
                dash.merge_range('B1:I1', "💡 Slicer Ready: Go to 'Data' tab, click any cell -> Insert -> Slicer to filter the Dashboard!", subtitle_fmt)

                dash.set_column('A:A', 3)
                dash.set_column('B:I', 16)
                dash.set_column('J:T', 14)

                # Title
                dash.set_row(1, 36)
                dash.merge_range('B2:I2', f"📊 Lumina AI — {analysis.filename}", title_fmt)
                q_score = analysis.quality.overall_score if analysis.quality else 'N/A'
                dash.merge_range('B3:I3',
                    f"Generated {datetime.now().strftime('%B %d, %Y')} • {len(df):,} rows × {len(df.columns)} columns • Quality Score: {q_score}",
                    subtitle_fmt)

                # ── Navigation Hyperlinks ────────────────────────
                nav_row = 3
                dash.write_url(nav_row, 9, "internal:'Data'!A1", link_fmt, '📋 Go to Data')
                dash.write_url(nav_row, 10, "internal:'Column Profiles'!A1", link_fmt, '🔬 Profiles')
                if analysis.quality:
                    dash.write_url(nav_row, 11, "internal:'Quality Audit'!A1", link_fmt, '🛡️ Quality')
                if analysis.ml_results and analysis.ml_results.segmentation:
                    dash.write_url(nav_row, 12, "internal:'Segments'!A1", link_fmt, '🎯 Segments')

                # ── KPI Strip ────────────────────────────────────
                dash.merge_range('B5:I5', "KEY PERFORMANCE INDICATORS", section_fmt)
                kpis = []
                
                # Professional Metrics Mapping
                for nc in num_cols[:8]:
                    nc_lower = nc.lower()
                    if any(k in nc_lower for k in money_keys):
                        kpis.append({"label": f"Gross Revenue / Value ({nc})", "value": f"${df[nc].sum():,.0f}"})
                    elif any(k in nc_lower for k in ['quantity', 'count', 'order', 'units', 'id']):
                        kpis.append({"label": f"Total Volume ({nc})", "value": f"{df[nc].sum():,.0f}"})
                    elif any(k in nc_lower for k in pct_keys):
                        kpis.append({"label": f"Avg Ratio ({nc})", "value": f"{df[nc].mean():.1%}"})
                    else:
                        kpis.append({"label": f"Average ({nc})", "value": f"{df[nc].mean():,.2f}"})
                    if len(kpis) >= 4:
                        break

                # Override from analysis prescriptive key_metrics
                if analysis.prescriptive and hasattr(analysis.prescriptive, 'key_metrics') and analysis.prescriptive.key_metrics:
                    for km in analysis.prescriptive.key_metrics[:4]:
                        label = km.label if hasattr(km, 'label') else km.get('label', '') if isinstance(km, dict) else ''
                        value = km.value if hasattr(km, 'value') else km.get('value', '') if isinstance(km, dict) else ''
                        if label:
                            kpis.insert(0, {"label": str(label), "value": str(value)})

                kpis = kpis[:4]
                col_pos = 1
                for kpi in kpis:
                    dash.merge_range(6, col_pos, 7, col_pos + 1, kpi["value"], kpi_value_fmt)
                    dash.merge_range(8, col_pos, 8, col_pos + 1, kpi["label"], kpi_label_fmt)
                    col_pos += 2

                # ── Executive AI Insights ──────────────────────────
                dash.merge_range('K5:T5', "EXECUTIVE INSIGHTS & STRATEGIC PRIORITIES (AI GENERATED)", section_fmt)
                insight_title_fmt = workbook.add_format({
                    'bold': True, 'font_size': 11, 'font_color': BRAND["cyan"], 'text_wrap': True, 'valign': 'top'
                })
                insight_body_fmt = workbook.add_format({
                    'font_size': 10, 'font_color': BRAND["bg_dark"], 'text_wrap': True, 'valign': 'top',
                    'border': 1, 'border_color': BRAND["border"], 'left': 3, 'left_color': BRAND["purple"], 'bg_color': '#F8F9FA'
                })
                
                if analysis.prescriptive and hasattr(analysis.prescriptive, 'ranked_insights') and analysis.prescriptive.ranked_insights:
                    row_offset = 6
                    for rin in analysis.prescriptive.ranked_insights[:4]:
                        # Handle Pydantic objects safely
                        title = getattr(rin, 'title', '') or (rin.get('title', '') if isinstance(rin, dict) else '')
                        desc = getattr(rin, 'description', '') or (rin.get('description', '') if isinstance(rin, dict) else '')
                        action = getattr(rin, 'action', '') or (rin.get('action', '') if isinstance(rin, dict) else '')
                        roi = getattr(rin, 'roi_estimate', '') or (rin.get('roi_estimate', '') if isinstance(rin, dict) else '')
                        
                        dash.merge_range(row_offset, 10, row_offset, 19, f"💡 {title} | ROI: {roi}", insight_title_fmt)
                        dash.set_row(row_offset, 18)
                        dash.merge_range(row_offset + 1, 10, row_offset + 2, 19, f"{desc}\nAction: {action}", insight_body_fmt)
                        dash.set_row(row_offset + 1, 30)
                        dash.set_row(row_offset + 2, 30)
                        row_offset += 4
                else:
                    dash.merge_range('K6:T8', "AI Insights are still generating or unavailable for this dataset. Please export again later.", insight_body_fmt)

                # ── Charts ───────────────────────────────────────
                chart_data_row = 60  # Hidden data area

                # Chart 1: Bar — Top numeric by category
                if num_cols and cat_cols:
                    dash.merge_range('B11:E11', "REVENUE & PERFORMANCE ANALYSIS", section_fmt)
                    t_num, t_cat = num_cols[0], cat_cols[0]
                    grouped = df.groupby(t_cat)[t_num].sum().nlargest(10)
                    for i, (cv, nv) in enumerate(grouped.items()):
                        dash.write(chart_data_row + i, 9, str(cv))
                        dash.write(chart_data_row + i, 10, nv)

                    bar = workbook.add_chart({'type': 'bar'})
                    bar.add_series({
                        'name': f'{t_num} by {t_cat}',
                        'categories': ['Dashboard', chart_data_row, 9, chart_data_row + len(grouped) - 1, 9],
                        'values': ['Dashboard', chart_data_row, 10, chart_data_row + len(grouped) - 1, 10],
                        'fill': {'color': BRAND["cyan"]},
                        'border': {'color': BRAND["bg_card"]},
                        'data_labels': {'value': True, 'num_format': '#,##0', 'font': {'color': BRAND["text"], 'size': 8}},
                    })
                    bar.set_title({'name': f'Top {t_cat} by {t_num}', 'name_font': {'color': BRAND["text"], 'size': 12}})
                    bar.set_legend({'none': True})
                    bar.set_chartarea({'border': {'color': BRAND["border"]}})
                    bar.set_plotarea({})
                    bar.set_x_axis({'label_position': 'low', 'num_font': {'color': BRAND["muted"], 'size': 9}})
                    bar.set_y_axis({'num_font': {'color': BRAND["muted"], 'size': 9},
                                    'major_gridlines': {'visible': True, 'line': {'color': BRAND["border"]}}})
                    dash.insert_chart('B12', bar, {'x_scale': 1.8, 'y_scale': 1.4})

                # Chart 2: Donut — Category distribution
                if cat_cols:
                    dash.merge_range('F11:I11', "COMPOSITION BREAKDOWN", section_fmt)
                    cat_t = cat_cols[0]
                    cat_counts = df[cat_t].value_counts().head(8)
                    for i, (cv, cnt) in enumerate(cat_counts.items()):
                        dash.write(chart_data_row + i, 12, str(cv))
                        dash.write(chart_data_row + i, 13, cnt)

                    donut = workbook.add_chart({'type': 'doughnut'})
                    donut.add_series({
                        'name': f'{cat_t} Distribution',
                        'categories': ['Dashboard', chart_data_row, 12, chart_data_row + len(cat_counts) - 1, 12],
                        'values': ['Dashboard', chart_data_row, 13, chart_data_row + len(cat_counts) - 1, 13],
                        'points': [{'fill': {'color': c}} for c in BRAND["palette"][:len(cat_counts)]],
                        'data_labels': {'category': True, 'percentage': True, 'font': {'color': BRAND["text"], 'size': 8}},
                    })
                    donut.set_title({'name': f'{cat_t} Distribution', 'name_font': {'color': BRAND["text"], 'size': 12}})
                    donut.set_chartarea({'border': {'color': BRAND["border"]}})
                    donut.set_legend({'font': {'color': BRAND["muted"], 'size': 9}})
                    dash.insert_chart('F12', donut, {'x_scale': 1.5, 'y_scale': 1.4})

                # Chart 3: Quality bar (if issues exist)
                if analysis.quality and (analysis.quality.high_issues or analysis.quality.critical_issues):
                    dash.merge_range('B26:I26', "DATA QUALITY AUDIT", section_fmt)
                    top_issues = (analysis.quality.critical_issues + analysis.quality.high_issues)[:6]
                    for i, iss in enumerate(top_issues):
                        dash.write(chart_data_row + i, 15, getattr(iss, 'title', 'Issue')[:30])
                        dash.write(chart_data_row + i, 16, getattr(iss, 'rows_affected', 0))

                    q_chart = workbook.add_chart({'type': 'bar'})
                    q_chart.add_series({
                        'name': 'Rows Affected',
                        'categories': ['Dashboard', chart_data_row, 15, chart_data_row + len(top_issues) - 1, 15],
                        'values': ['Dashboard', chart_data_row, 16, chart_data_row + len(top_issues) - 1, 16],
                        'fill': {'color': BRAND["red"]},
                        'data_labels': {'value': True, 'num_format': '#,##0', 'font': {'color': BRAND["text"], 'size': 8}},
                    })
                    q_chart.set_title({'name': 'Quality Issues — Rows Affected', 'name_font': {'color': BRAND["text"], 'size': 12}})
                    q_chart.set_legend({'none': True})
                    q_chart.set_chartarea({'border': {'color': BRAND["border"]}})
                    q_chart.set_plotarea({})
                    q_chart.set_x_axis({'num_font': {'color': BRAND["muted"], 'size': 9}})
                    q_chart.set_y_axis({'num_font': {'color': BRAND["muted"], 'size': 9},
                                        'major_gridlines': {'visible': True, 'line': {'color': BRAND["border"]}}})
                    dash.insert_chart('B27', q_chart, {'x_scale': 2.2, 'y_scale': 1.2})

                # Chart 4: Scatter — Column correlation
                if len(num_cols) >= 2:
                    n1, n2 = num_cols[0], num_cols[1]
                    n1_l = xlsx_util.xl_col_to_name(df.columns.get_loc(n1))
                    n2_l = xlsx_util.xl_col_to_name(df.columns.get_loc(n2))
                    scatter = workbook.add_chart({'type': 'scatter'})
                    scatter.add_series({
                        'name': f'{n1} vs {n2}',
                        'categories': f'=Data!${n1_l}$2:${n1_l}$201',
                        'values': f'=Data!${n2_l}$2:${n2_l}$201',
                        'marker': {'type': 'circle', 'size': 5, 'fill': {'color': BRAND["purple"]}, 'border': {'color': BRAND["bg_card"]}},
                    })
                    scatter.set_title({'name': f'Correlation: {n1} vs {n2}', 'name_font': {'color': BRAND["text"], 'size': 12}})
                    scatter.set_chartarea({'border': {'color': BRAND["border"]}})
                    scatter.set_plotarea({})
                    scatter.set_x_axis({'name': n1, 'name_font': {'color': BRAND["muted"]}, 'num_font': {'color': BRAND["muted"], 'size': 9},
                                        'major_gridlines': {'visible': True, 'line': {'color': BRAND["border"]}}})
                    scatter.set_y_axis({'name': n2, 'name_font': {'color': BRAND["muted"]}, 'num_font': {'color': BRAND["muted"], 'size': 9},
                                        'major_gridlines': {'visible': True, 'line': {'color': BRAND["border"]}}})
                    dash.insert_chart('B41', scatter, {'x_scale': 1.8, 'y_scale': 1.4})

                # Chart 5: Trend line (if datetime + numeric exist)
                if date_cols and num_cols:
                    d_col = date_cols[0]
                    trend_num = num_cols[0]
                    try:
                        trend_df = df.groupby(d_col)[trend_num].sum().sort_index().tail(50)
                        if len(trend_df) >= 3:
                            for i, (dt_val, num_val) in enumerate(trend_df.items()):
                                dash.write(chart_data_row + i, 18, str(dt_val))
                                dash.write(chart_data_row + i, 19, num_val)

                            trend_chart = workbook.add_chart({'type': 'line'})
                            trend_chart.add_series({
                                'name': f'{trend_num} Over Time',
                                'categories': ['Dashboard', chart_data_row, 18, chart_data_row + len(trend_df) - 1, 18],
                                'values': ['Dashboard', chart_data_row, 19, chart_data_row + len(trend_df) - 1, 19],
                                'line': {'color': BRAND["green"], 'width': 2.5},
                                'marker': {'type': 'circle', 'size': 4, 'fill': {'color': BRAND["green"]}},
                                'data_labels': {'value': False},
                            })
                            trend_chart.set_title({'name': f'Trend: {trend_num} Over Time',
                                                    'name_font': {'color': BRAND["text"], 'size': 12}})
                            trend_chart.set_legend({'none': True})
                            trend_chart.set_chartarea({'border': {'color': BRAND["border"]}})
                            trend_chart.set_plotarea({})
                            trend_chart.set_x_axis({'name': d_col, 'name_font': {'color': BRAND["muted"]},
                                                    'num_font': {'color': BRAND["muted"], 'size': 8},
                                                    'label_position': 'low'})
                            trend_chart.set_y_axis({'name': trend_num, 'name_font': {'color': BRAND["muted"]},
                                                    'num_font': {'color': BRAND["muted"], 'size': 9},
                                                    'major_gridlines': {'visible': True, 'line': {'color': BRAND["border"]}}})
                            dash.insert_chart('F41', trend_chart, {'x_scale': 1.8, 'y_scale': 1.4})
                    except Exception:
                        pass  # Skip trend chart if data issues

                # AI Custom Charts
                if custom_charts:
                    c_row = 56
                    dash.merge_range(f'B{c_row-1}:I{c_row-1}', "AI-REQUESTED VISUALIZATIONS", section_fmt)
                    for i, custom in enumerate(custom_charts):
                        ctype = custom.get('type', 'bar')
                        cols = custom.get('columns', [])
                        if not cols and num_cols:
                            cols = [num_cols[0]]
                        if cols and cols[0] in df.columns:
                            ci = df.columns.get_loc(cols[0])
                            cl = xlsx_util.xl_col_to_name(ci)
                            xc = workbook.add_chart({'type': ctype if ctype in ['bar', 'line', 'scatter', 'pie', 'column'] else 'bar'})
                            xc.add_series({
                                'name': cols[0], 'categories': '=Data!$A$2:$A$21',
                                'values': f'=Data!${cl}$2:${cl}$21',
                                'fill': {'color': BRAND["teal"]},
                                'data_labels': {'value': True, 'font': {'color': BRAND["text"], 'size': 8}},
                            })
                            xc.set_title({'name': f'{cols[0]} ({ctype.title()})', 'name_font': {'color': BRAND["text"], 'size': 11}})
                            xc.set_chartarea({'border': {'color': BRAND["border"]}})
                            xc.set_plotarea({})
                            xc.set_legend({'none': True})
                            dash.insert_chart(f'B{c_row + (i * 16)}', xc, {'x_scale': 1.5, 'y_scale': 1.2})

                # ── Interactive Summary Statistics Table ──────────
                stats_start_row = 72
                dash.merge_range(f'B{stats_start_row}:I{stats_start_row}', "COLUMN STATISTICS SUMMARY", section_fmt)
                stats_headers = ["Column", "Mean", "Median", "Std Dev", "Min", "Max", "Nulls %"]
                for h_i, h_val in enumerate(stats_headers):
                    dash.write(stats_start_row, 1 + h_i, h_val, stat_header_fmt)

                for s_i, nc_name in enumerate(num_cols[:10]):
                    r = stats_start_row + 1 + s_i
                    col_data = df[nc_name].dropna()
                    dash.write(r, 1, nc_name, workbook.add_format({
                        'font_size': 9, 'font_color': BRAND["cyan"], 'bold': True,
                        'bg_color': BRAND["bg_card"], 'border': 1, 'border_color': BRAND["border"],
                    }))
                    if len(col_data) > 0:
                        for v_i, v_val in enumerate([
                            col_data.mean(), col_data.median(), col_data.std(),
                            col_data.min(), col_data.max(),
                            (df[nc_name].isnull().sum() / len(df)) * 100
                        ]):
                            dash.write(r, 2 + v_i, v_val, stat_val_fmt)
                    else:
                        for v_i in range(6):
                            dash.write(r, 2 + v_i, "N/A", stat_val_fmt)

                # ── Named Ranges for key metrics ──────────────────
                try:
                    for k_i, kpi in enumerate(kpis[:4]):
                        safe_name = kpi["label"].replace(" ", "_").replace("$", "").replace("%", "Pct")[:20]
                        workbook.define_name(f'KPI_{safe_name}', f"=Dashboard!{xlsx_util.xl_col_to_name(2 + k_i * 2)}7")
                except Exception:
                    pass  # Named ranges are optional


            # ── Sheet 2: Column Profiles ─────────────────────────
            if analysis.profile:
                if advanced:
                # ── Data Dictionary Sheet ────────────────────────────────
                    summary_data = []
                    for cp in analysis.profile.column_profiles: # Corrected iteration
                        row_data = {
                            "Column": cp.name,
                            "Type": cp.dtype_raw,
                            "Completeness %": f"{100 - cp.null_pct:.1f}%",
                            "Unique Values": cp.unique_count,
                            "Sample Values": ", ".join(map(str, cp.sample_values[:3])),
                        }
                        if cp.dtype_family == "numeric":
                            row_data.update({
                                "Mean": f"{cp.mean:.2f}" if cp.mean is not None else "",
                                "Min Value": cp.min_val, "Max Value": cp.max_val,
                            })
                        summary_data.append(row_data)

                    df_dict = pd.DataFrame(summary_data)
                    df_dict.to_excel(writer, sheet_name="Data Dictionary", index=False)
                    ws_dict = writer.sheets["Data Dictionary"]
                    header_fmt = workbook.add_format({
                        'bold': True, 'font_color': '#FFFFFF', 'bg_color': '#111827', 'border': 1
                    })
                    for col_num, col_name in enumerate(df_dict.columns):
                        ws_dict.write(0, col_num, col_name, header_fmt)
                        ws_dict.set_column(col_num, col_num, 16)
                    ws_dict.freeze_panes(1, 0)

                    (max_row, max_col) = df_dict.shape
                    
                    # Back to Dashboard link
                    back_link_fmt = workbook.add_format({'font_color': '#00E5FF', 'underline': True, 'font_size': 9, 'align': 'right'})
                    ws_dict.write_url(0, max_col, "internal:'Dashboard'!B2", back_link_fmt, '← Dashboard')

                    if max_row > 0:
                        ws_dict.add_table(0, 0, max_row, max_col - 1, {
                            'columns': [{"header": col} for col in df_dict.columns],
                            'style': 'Table Style Medium 2'
                        })
                        
                        if "Completeness %" in df_dict.columns:
                            n_idx = df_dict.columns.get_loc("Completeness %")
                            n_l = xlsx_util.xl_col_to_name(n_idx)
                            ws_dict.conditional_format(
                                f'{n_l}2:{n_l}{max_row+1}',
                                {'type': '3_color_scale', 'min_color': '#FCA5A5', 'mid_color': '#FDE047', 'max_color': '#86EFAC'}
                            )

            # ── Sheet 3: Quality Audit ───────────────────────────
            if analysis.quality:
                issues_data = []
                all_issues = (analysis.quality.critical_issues + analysis.quality.high_issues
                              + analysis.quality.medium_issues + analysis.quality.low_issues)
                for issue in all_issues:
                    issues_data.append({
                        "Issue Type": issue.issue_type, "Title": issue.title,
                        "Severity": issue.severity.value, "Column": issue.column or "",
                        "Rows Affected": issue.rows_affected,
                        "Auto-Fixable": "Yes" if issue.can_auto_fix else "No",
                    })
                df_issues = pd.DataFrame(issues_data)
                df_issues.to_excel(writer, sheet_name="Quality Audit", index=False)
                if not df_issues.empty:
                    ws_q = writer.sheets["Quality Audit"]
                    for col_num, col_name in enumerate(df_issues.columns):
                        ws_q.write(0, col_num, col_name, header_fmt)
                    ws_q.freeze_panes(1, 0)

                    # Back to Dashboard link
                    if advanced:
                        back_link_fmt_q = workbook.add_format({'font_color': '#00E5FF', 'underline': True, 'font_size': 9, 'align': 'right'})
                        ws_q.write_url(0, len(df_issues.columns), "internal:'Dashboard'!B2", back_link_fmt_q, '← Dashboard')
                    (mr, mc) = df_issues.shape
                    ws_q.add_table(0, 0, mr, mc - 1, {
                        'columns': [{"header": col} for col in df_issues.columns],
                        'style': 'Table Style Medium 4'
                    })
                    if "Severity" in df_issues.columns:
                        si = df_issues.columns.get_loc("Severity")
                        sl = xlsx_util.xl_col_to_name(si)
                        for sev, bg, fg in [("critical", "#FECACA", "#991B1B"), ("high", "#FED7AA", "#9A3412"),
                                             ("medium", "#FEF08A", "#854D0E"), ("low", "#D1FAE5", "#065F46")]:
                            ws_q.conditional_format(f'{sl}2:{sl}{mr+1}', {
                                'type': 'cell', 'criteria': '==', 'value': f'"{sev}"',
                                'format': workbook.add_format({'bg_color': bg, 'font_color': fg, 'bold': sev == 'critical'})
                            })

            # ── Sheet 4: Segments ────────────────────────────────
            if analysis.ml_results and analysis.ml_results.segmentation:
                seg = analysis.ml_results.segmentation
                if seg.segment_profiles:
                    df_seg = pd.DataFrame(seg.segment_profiles)
                    df_seg.to_excel(writer, sheet_name="Segments", index=False)
                    if not df_seg.empty:
                        ws_seg = writer.sheets["Segments"]
                        for col_num, col_name in enumerate(df_seg.columns):
                            ws_seg.write(0, col_num, str(col_name), header_fmt)
                        ws_seg.freeze_panes(1, 0)
                        (mr, mc) = df_seg.shape
                        ws_seg.add_table(0, 0, mr, mc - 1, {
                            'columns': [{"header": str(col)} for col in df_seg.columns],
                    'style': 'Table Style Medium 14'
                        })
                        if "size_pct" in df_seg.columns:
                            s_idx = df_seg.columns.get_loc("size_pct")
                            s_l = xlsx_util.xl_col_to_name(s_idx)
                        ws_seg.conditional_format(f'{s_l}2:{s_l}{mr+1}', {'type': 'data_bar', 'bar_color': '#10B981'})

            # ── Sheet 5: Transformation Log (Lineage) ─────────────
            lineage = getattr(analysis, 'lineage', []) or []
            if lineage:
                df_lin = pd.DataFrame(lineage)
                df_lin.to_excel(writer, sheet_name="Transformation Log", index=False)
                ws_lin = writer.sheets["Transformation Log"]
                for col_num, col_name in enumerate(df_lin.columns):
                    ws_lin.write(0, col_num, col_name, header_fmt)
                ws_lin.set_column('A:A', 25) # Timestamp
                ws_lin.set_column('B:B', 20) # Action
                ws_lin.set_column('C:C', 50) # Details
                ws_lin.set_column('D:D', 80) # Code
                ws_lin.freeze_panes(1, 0)
            # Cleanup
            del workbook, writer
            gc.collect()
            return output.getvalue()

    # ═══════════════════════════════════════════════════════════════
    # POWER BI EXPORT — Professional Blueprint + Theme
    # ═══════════════════════════════════════════════════════════════

    async def export_powerbi(
        self, df: pd.DataFrame, analysis: FullAnalysisResult, custom_charts: list[dict] = None
    ) -> bytes:
        """Generate ZIP with CSV, rich Power BI blueprint, DAX library, and color theme JSON."""
        logger.info("Generating PowerBI Dashboard blueprint export")

        num_cols = df.select_dtypes('number').columns.tolist()
        cat_cols = df.select_dtypes(include=['object', 'category']).columns.tolist()
        date_cols = df.select_dtypes(include=['datetime', 'datetime64']).columns.tolist()

        # 1. CSV Data
        csv_buffer = io.StringIO()
        df.to_csv(csv_buffer, index=False)
        csv_bytes = csv_buffer.getvalue().encode('utf-8')

        # 2. Color Theme JSON
        theme_json = json.dumps({
            "name": "Lumina AI Theme",
            "dataColors": BRAND["palette"],
            "background": {"color": BRAND["bg_dark"]},
            "foreground": {"color": BRAND["text"]},
            "tableAccent": BRAND["cyan"],
            "visualStyles": {
                "*": {
                    "*": {
                        "general": [{"responsive": True}],
                        "background": [{"color": {"solid": {"color": BRAND["bg_card"]}}, "transparency": 0}],
                        "border": [{"color": {"solid": {"color": BRAND["border"]}}, "show": True}],
                        "title": [{"fontColor": {"solid": {"color": BRAND["text"]}}, "fontSize": 12}],
                    }
                }
            }
        }, indent=2)

        # 3. DAX Measures Library
        dax_measures = f"""# Lumina AI — DAX Measures Library
# Copy these into Power BI Desktop → Modeling → New Measure

## Core Metrics
"""
        if num_cols:
            n = num_cols[0]
            dax_measures += f"""
### Total {n}
Total {n} = SUM('{analysis.filename}'[{n}])

### Average {n}
Avg {n} = AVERAGE('{analysis.filename}'[{n}])

### Year-over-Year Growth
YoY Growth % = 
VAR CurrentYear = CALCULATE(SUM('{analysis.filename}'[{n}]), YEAR(TODAY()))
VAR PreviousYear = CALCULATE(SUM('{analysis.filename}'[{n}]), YEAR(TODAY()) - 1)
RETURN DIVIDE(CurrentYear - PreviousYear, PreviousYear, 0)

### Running Total
Running Total = 
CALCULATE(
    SUM('{analysis.filename}'[{n}]),
    FILTER(
        ALLSELECTED('{analysis.filename}'),
        '{analysis.filename}'[{date_cols[0] if date_cols else 'Date'}] <= MAX('{analysis.filename}'[{date_cols[0] if date_cols else 'Date'}])
    )
)

### Moving Average (3-Period)
3-Period Moving Avg = 
AVERAGEX(
    DATESINPERIOD('{analysis.filename}'[{date_cols[0] if date_cols else 'Date'}], MAX('{analysis.filename}'[{date_cols[0] if date_cols else 'Date'}]), -3, MONTH),
    CALCULATE(SUM('{analysis.filename}'[{n}]))
)
"""
        if len(num_cols) >= 2:
            dax_measures += f"""
### Profit Margin
Profit Margin % = DIVIDE(SUM('{analysis.filename}'[{num_cols[1]}]), SUM('{analysis.filename}'[{num_cols[0]}]), BLANK())

### Safe Division Template
Safe Ratio = DIVIDE([Numerator Measure], [Denominator Measure], BLANK())
"""

        # 4. Rich Blueprint
        exec_summary = ""
        if analysis.prescriptive and hasattr(analysis.prescriptive, 'executive_summary'):
            exec_summary = analysis.prescriptive.executive_summary or "No insights available."

        blueprint = f"""# 📊 Lumina AI — Power BI Dashboard Blueprint
**File:** {analysis.filename}
**Generated:** {datetime.now().strftime('%Y-%m-%d %H:%M')}
**Dataset:** {len(df):,} rows × {len(df.columns)} columns

---

## 🎨 Step 1: Import Theme
1. Open Power BI Desktop
2. Go to **View** → **Themes** → **Browse for themes**
3. Select the included `lumina_theme.json`
4. This applies the Lumina AI color palette to all visuals

## 📥 Step 2: Load Data
1. **Get Data** → **Text/CSV** → Select `dataset.csv`
2. Click **Transform Data** to review column types
3. Ensure dates are recognized as Date type
4. Click **Close & Apply**

## 📐 Step 3: Dashboard Layout

### Page 1: Executive Summary
| Position | Visual Type | Configuration |
|----------|-------------|---------------|
| Top Row | **Card** (×4) | {', '.join(num_cols[:4]) if num_cols else 'Key metrics'} |
| Left Sidebar | **Slicer** (×3) | {', '.join(cat_cols[:3]) if cat_cols else 'Category filters'} |
| Center | **Clustered Bar** | Y: `{cat_cols[0] if cat_cols else 'Category'}`, X: `{num_cols[0] if num_cols else 'Value'}` |
| Center-Right | **Donut Chart** | Legend: `{cat_cols[0] if cat_cols else 'Category'}`, Values: Count |
| Bottom | **Line Chart** | X: `{date_cols[0] if date_cols else 'Date'}`, Y: `{num_cols[0] if num_cols else 'Value'}` |

### Page 2: Deep Analysis
| Position | Visual Type | Configuration |
|----------|-------------|---------------|
| Top | **Matrix** | Rows: `{cat_cols[0] if cat_cols else 'Category'}`, Columns: `{cat_cols[1] if len(cat_cols)>1 else 'Sub-Category'}`, Values: `{num_cols[0] if num_cols else 'Value'}` |
| Center-Left | **Scatter Plot** | X: `{num_cols[0] if num_cols else 'X'}`, Y: `{num_cols[1] if len(num_cols)>1 else 'Y'}`, Size: `{num_cols[2] if len(num_cols)>2 else 'Size'}` |
| Center-Right | **Treemap** | Group: `{cat_cols[0] if cat_cols else 'Category'}`, Values: `{num_cols[0] if num_cols else 'Value'}` |
| Bottom | **Table** | Top 10 records sorted by `{num_cols[0] if num_cols else 'Value'}` descending |

### Page 3: Quality & Segments
| Position | Visual Type | Configuration |
|----------|-------------|---------------|
| Top | **Gauge** | Quality Score: {analysis.quality.overall_score if analysis.quality else 'N/A'}/100 |
| Center | **Stacked Bar** | Quality issues by severity |
| Bottom | **Clustered Column** | Segment profiles from ML analysis |

## 💡 Step 4: AI Insights
Paste into a **Text Box** visual:
> {exec_summary}

## 📊 AI-Requested Charts
{chr(10).join([f"{i+1}. Add a **{c.get('type', 'bar').title()} Chart** for columns: `{', '.join(c.get('columns', []))}`" for i, c in enumerate(custom_charts)]) if custom_charts else "No custom chart requests in this session."}

## 🧮 Step 5: DAX Measures
See the included `dax_measures.md` file for pre-built formulas including:
- Total / Average calculations
- Year-over-Year growth
- Running totals
- Moving averages
- Profit margins with safe division

## 🔗 Step 6: Data Model & Relationships
{f'''
### Suggested Date Table
Create a dedicated Date dimension table for time intelligence:
1. Go to **Modeling** → **New Table**
2. Paste: `DateTable = CALENDAR(MIN('{analysis.filename}'[{date_cols[0]}]), MAX('{analysis.filename}'[{date_cols[0]}]))`
3. Add columns: Year, Quarter, Month, Day, WeekDay
4. Create relationship: `DateTable[Date]` → `{analysis.filename}[{date_cols[0]}]` (1:Many)
''' if date_cols else '- No date columns detected. Consider adding a Date column for time intelligence.'}

### Suggested Dimension Relationships
{chr(10).join([f"- `{c}` → Can serve as a **slicer dimension** for cross-filtering all visuals" for c in cat_cols[:5]]) if cat_cols else '- No categorical dimension columns detected.'}

## 🎛️ Step 7: Interactivity Best Practices
1. **Edit Interactions**: Click a visual → Format → Edit Interactions → Set cross-filtering behavior
2. **Bookmarks**: Create bookmarks for "Executive View" vs "Analyst Deep Dive" vs "Quality Report"
3. **Drill-through**: Right-click a category bar → Set up drill-through to Page 2 for detailed analysis
4. **Tooltips**: Create a tooltip page with a mini chart showing trend for the hovered category
5. **Conditional Formatting**: On Matrix/Table visuals, apply background color scales to numeric values

## ⚡ Step 8: Power Query Transformations
Import the included `power_query.m` file or paste this M code into **Advanced Editor**:
```
See power_query.m in the ZIP file for auto-generated column typing M code.
```

Key transformations to apply in Power Query:
{chr(10).join([f"- Column `{c}` → Change Type to **Whole Number** or **Decimal Number**" for c in num_cols[:5]]) if num_cols else ''}
{chr(10).join([f"- Column `{c}` → Change Type to **Date**" for c in date_cols[:3]]) if date_cols else ''}
{chr(10).join([f"- Column `{c}` → Change Type to **Text**" for c in cat_cols[:5]]) if cat_cols else ''}

## 🏗️ Step 9: Star Schema Data Model
For best performance, create a **star schema** with these dimension tables:

{f'''### Fact Table: `{analysis.filename}`
Contains all measures: {", ".join(f"`{c}`" for c in num_cols[:6])}

### Dimension Tables:
''' + chr(10).join([f'''**Dim_{c}**
1. Go to **Modeling** → **New Table**
2. `Dim_{c} = DISTINCT('{analysis.filename}'[{c}])`
3. Create relationship: `Dim_{c}[{c}]` → `{analysis.filename}[{c}]` (1:Many)
4. Use `Dim_{c}` for slicers instead of the fact table column''' for c in cat_cols[:3]]) if cat_cols else '- No categorical columns for dimension tables.'}

## 🔒 Step 10: Row-Level Security (RLS)
If you need to restrict data by user role:
1. Go to **Modeling** → **Manage Roles**
2. Create a new role (e.g., "RegionManager")
3. Add a DAX filter:
{f'   `[{cat_cols[0]}] = USERPRINCIPALNAME()`' if cat_cols else '   `[Category] = USERPRINCIPALNAME()`'}
4. Test with **View as Role** before publishing

## 📱 Step 11: Mobile Layout
1. Go to **View** → **Mobile Layout**
2. Drag visuals in this priority order:
   - **KPI Cards** (top) — most important metrics at a glance
   - **Trend Line** — shows direction
   - **Top Bar Chart** — key category breakdown
   - **Slicers** (bottom) — allow quick filtering
3. Set all visuals to **Maintain Aspect Ratio**
"""

        # 5. Power Query M Code
        m_code_lines = [f'let\n    Source = Csv.Document(File.Contents("dataset.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.None]),']
        m_code_lines.append('    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),')
        
        type_mappings = []
        for c in df.columns:
            if c in num_cols:
                if str(df[c].dtype) in ['int64', 'int32', 'Int64']:
                    type_mappings.append(f'{{""{c}"", Int64.Type}}')
                else:
                    type_mappings.append(f'{{""{c}"", type number}}')
            elif c in date_cols:
                type_mappings.append(f'{{""{c}"", type date}}')
            else:
                type_mappings.append(f'{{""{c}"", type text}}')
        
        m_code_lines.append(f'    TypedColumns = Table.TransformColumnTypes(PromotedHeaders, {{{", ".join(type_mappings[:30])}}})') 
        m_code_lines.append('in\n    TypedColumns')
        m_code = '\n'.join(m_code_lines)

        # 6. Zip everything
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("dataset.csv", csv_bytes)
            zf.writestr("lumina_theme.json", theme_json.encode('utf-8'))
            zf.writestr("dax_measures.md", dax_measures.encode('utf-8'))
            zf.writestr("dashboard_blueprint.md", blueprint.encode('utf-8'))
            zf.writestr("power_query.m", m_code.encode('utf-8'))

        result = zip_buffer.getvalue()
        del zip_buffer
        gc.collect()
        return result


    # ═══════════════════════════════════════════════════════════════
    # HTML EXPORT — Standalone Dashboard
    # ═══════════════════════════════════════════════════════════════

    async def export_html(
        self, analysis: FullAnalysisResult
    ) -> str:
        """Generate standalone HTML dashboard."""
        import numpy as np
        logger.info("Generating HTML export")

        charts_json = []
        for chart in (analysis.charts or []):
            charts_json.append(_clean_for_json({
                "id": chart.chart_id,
                "type": chart.chart_type,
                "title": chart.title,
                "data": chart.plotly_data,
                "layout": chart.plotly_layout,
            }))

        # Pre-build insights HTML to avoid nested f-string syntax issues in Python 3.11
        _insights_section = ""
        if analysis.prescriptive and analysis.prescriptive.ranked_insights:
            _insight_cards = []
            for ins in (analysis.prescriptive.ranked_insights[:3] if analysis.prescriptive.ranked_insights else []):
                _title = ins.get('title', 'Insight') if isinstance(ins, dict) else getattr(ins, 'title', 'Insight')
                _desc = ins.get('description', '') if isinstance(ins, dict) else getattr(ins, 'description', '')
                _action = ins.get('action', '') if isinstance(ins, dict) else getattr(ins, 'action', '')
                _insight_cards.append(
                    f'<div style="background: rgba(123, 47, 255, 0.1); border: 1px solid {BRAND["border"]}; padding: 1rem; border-radius: 8px;">'
                    f'<div style="color: {BRAND["cyan"]}; font-weight: 600; margin-bottom: 0.5rem;">{_title}</div>'
                    f'<div style="font-size: 0.9rem; margin-bottom: 0.5rem;">{_desc}</div>'
                    f'<div style="font-size: 0.8rem; color: {BRAND["muted"]};"><b>Action:</b> {_action}</div>'
                    f'</div>'
                )
            _insights_section = (
                f'<h3 style="color: {BRAND["purple"]}; margin-top: 2rem; margin-bottom: 1rem;">💡 Top Strategic Insights</h3>'
                f'<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1rem;">'
                + "".join(_insight_cards)
                + '</div>'
            )

        html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Lumina AI Report — {analysis.filename}</title>
    <script src="https://cdn.plot.ly/plotly-2.27.0.min.js"></script>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{ background: {BRAND["bg_dark"]}; color: {BRAND["text"]}; font-family: 'DM Sans', system-ui, sans-serif; padding: 2rem; }}
        h1 {{ font-family: 'Space Grotesk', sans-serif; color: {BRAND["cyan"]}; margin-bottom: 0.5rem; }}
        .subtitle {{ color: {BRAND["muted"]}; margin-bottom: 2rem; }}
        .chart-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(500px, 1fr)); gap: 1.5rem; }}
        .chart-card {{
            background: {BRAND["bg_card"]}; border: 1px solid {BRAND["border"]}; border-radius: 12px;
            padding: 1.5rem; transition: transform 0.2s;
        }}
        .chart-card:hover {{ transform: translateY(-2px); }}
        .chart-title {{ font-size: 1rem; font-weight: 600; margin-bottom: 1rem; }}
        .kpi-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem; }}
        .kpi-card {{
            background: linear-gradient(135deg, {BRAND["bg_card"]}, #1A1D2E); border: 1px solid {BRAND["border"]};
            border-radius: 12px; padding: 1.5rem; text-align: center;
        }}
        .kpi-value {{ font-size: 2rem; font-weight: 700; font-family: 'JetBrains Mono', monospace; color: {BRAND["cyan"]}; }}
        .kpi-label {{ font-size: 0.875rem; color: {BRAND["muted"]}; margin-top: 0.25rem; }}
        footer {{ margin-top: 3rem; text-align: center; color: {BRAND["muted"]}; font-size: 0.8rem; }}
    </style>
</head>
<body>
    <h1>🧠 Lumina AI — Analysis Report</h1>
    <p class="subtitle">{analysis.filename} • {analysis.profile.row_count if analysis.profile else '?'} rows × {analysis.profile.column_count if analysis.profile else '?'} columns • Generated {datetime.now().strftime('%Y-%m-%d %H:%M')}</p>

    <div class="kpi-grid" id="kpi-grid"></div>
    
    <div id="executive-narrative" style="background: {BRAND['bg_card']}; border-left: 4px solid {BRAND['purple']}; padding: 2rem; border-radius: 12px; margin-bottom: 2rem;">
        <h2 style="color: {BRAND['cyan']}; margin-bottom: 1rem;">🛰️ Executive Strategic Narrative</h2>
        <div style="line-height: 1.6; color: {BRAND['text']};">
            {analysis.prescriptive.executive_summary if analysis.prescriptive else 'No executive summary available for this dataset.'}
        </div>
        
        {_insights_section}
    </div>

    <div class="chart-grid" id="chart-grid"></div>

    <footer>Generated by Lumina AI v4.0 — Data Intelligence Platform</footer>

    <script>
        const charts = {json.dumps(charts_json)};

        // Render KPIs
        const kpiGrid = document.getElementById('kpi-grid');
        charts.filter(c => c.type === 'kpi').forEach(c => {{
            const card = document.createElement('div');
            card.className = 'kpi-card';
            const value = c.data[0]?.value || c.layout?.title?.text || '';
            card.innerHTML = '<div class="kpi-value">' + (c.title || '') + '</div><div class="kpi-label">' + value + '</div>';
            kpiGrid.appendChild(card);
        }});

        // Render Plotly charts
        const chartGrid = document.getElementById('chart-grid');
        charts.filter(c => c.type !== 'kpi').forEach(c => {{
            const card = document.createElement('div');
            card.className = 'chart-card';
            card.innerHTML = '<div class="chart-title">' + c.title + '</div><div id="chart-' + c.id + '"></div>';
            chartGrid.appendChild(card);
            try {{
                Plotly.newPlot('chart-' + c.id, c.data, {{...c.layout, height: 350}}, {{responsive: true, displayModeBar: false}});
            }} catch(e) {{ console.warn('Chart error:', c.id, e); }}
        }});
    </script>
</body>
</html>"""
        return html

    # ═══════════════════════════════════════════════════════════════
    # NOTEBOOK EXPORT
    # ═══════════════════════════════════════════════════════════════

    async def export_notebook(
        self, df: pd.DataFrame, analysis: FullAnalysisResult
    ) -> str:
        """Generate Jupyter notebook (.ipynb) JSON."""
        import pandas as pd
        import numpy as np
        logger.info("Generating Jupyter notebook export")

        cells = []
        cells.append(self._md_cell(
            f"# 🧠 Lumina AI — Analysis Report\n"
            f"**File:** {analysis.filename}\n"
            f"**Generated:** {datetime.now().strftime('%Y-%m-%d %H:%M')}\n"
            f"**Rows:** {analysis.profile.row_count if analysis.profile else '?'} | "
            f"**Columns:** {analysis.profile.column_count if analysis.profile else '?'}"
        ))
        cells.append(self._code_cell(
            "import pandas as pd\nimport numpy as np\nimport plotly.express as px\nimport plotly.graph_objects as go\n\n"
            f"# Load your data\n"
            f"# df = pd.read_csv('{analysis.filename}')\n"
            f"print(f'Dataset: {{df.shape[0]}} rows × {{df.shape[1]}} columns')\n"
            f"df.head()"
        ))

        if analysis.profile:
            cells.append(self._md_cell("## 📊 Dataset Profile"))
            cells.append(self._code_cell("# Column profiles\ndf.describe(include='all').T"))

        if analysis.quality:
            cells.append(self._md_cell(
                f"## 🔍 Data Quality Audit\n"
                f"**Score:** {analysis.quality.overall_score}/100 (Grade {analysis.quality.grade.value})\n"
                f"**Issues Found:** {analysis.quality.total_issues}"
            ))
            if analysis.quality.auto_clean_script:
                cells.append(self._md_cell("### Auto-Cleaning Script"))
                cells.append(self._code_cell(analysis.quality.auto_clean_script))

        if analysis.ml_results:
            cells.append(self._md_cell("## 🤖 Machine Learning Results"))
            if analysis.ml_results.anomalies:
                a = analysis.ml_results.anomalies
                cells.append(self._md_cell(
                    f"### Anomaly Detection\n"
                    f"- **Anomalies found:** {a.anomaly_count} ({a.anomaly_pct:.1f}%)\n"
                    f"- **Method:** 3-method ensemble (IsolationForest + LOF + EllipticEnvelope)"
                ))
            if analysis.ml_results.forecast:
                f = analysis.ml_results.forecast
                cells.append(self._md_cell(
                    f"### Forecasting\n"
                    f"- **Best model:** {f.best_model}\n"
                    f"- **MAPE:** {f.best_mape:.1f}%" if f.best_mape else "### Forecasting"
                ))

        if analysis.prescriptive:
            cells.append(self._md_cell(
                f"## 💡 Executive Summary\n{analysis.prescriptive.executive_summary}"
            ))

        notebook = {
            "nbformat": 4, "nbformat_minor": 5,
            "metadata": {
                "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
                "language_info": {"name": "python", "version": "3.11.0"},
            },
            "cells": cells,
        }
        return json.dumps(notebook, indent=2)

    async def export_pdf_html(self, analysis: FullAnalysisResult) -> str:
        """Generate printable HTML for PDF conversion."""
        html = await self.export_html(analysis)
        print_styles = """
        <style media="print">
            body { background: white !important; color: black !important; }
            .chart-card { break-inside: avoid; border-color: #ddd !important; }
            .kpi-value { color: #333 !important; }
        </style>"""
        return html.replace("</head>", print_styles + "\n</head>")

    @staticmethod
    def _md_cell(source: str) -> dict:
        return {"cell_type": "markdown", "metadata": {}, "source": [source]}

    @staticmethod
    def _code_cell(source: str) -> dict:
        return {"cell_type": "code", "metadata": {}, "source": [source], "outputs": [], "execution_count": None}
