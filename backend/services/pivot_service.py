"""
Lumina AI v4.0 — Pivot Service
Generates advanced cross-tabulations and multi-dimensional summaries.
"""

import pandas as pd
import numpy as np
from typing import List, Dict, Any, Optional
from loguru import logger
from models import PivotRequest, PivotResult

class PivotService:
    """
    Engine for generating professional pivot tables and cross-tabs.
    Handles aggregation, multi-index reconstruction, and JSON serialization.
    """

    def generate_pivot(
        self, 
        df: pd.DataFrame, 
        request: PivotRequest,
        session_id: str = ""
    ) -> PivotResult:
        """
        Creates a pivot table based on user-defined dimensions and metrics.
        """
        logger.info(f"Generating pivot for metrics: {request.values} by {request.rows} x {request.columns}")

        try:
            # 1. Basic Pivot Creation
            # Aggregation function mapping
            agg_map = {
                "mean": np.mean,
                "sum": np.sum,
                "count": "count",
                "min": np.min,
                "max": np.max
            }
            func = agg_map.get(request.agg_func, np.mean)

            # Make a shallow copy to prevent modifying the original DataFrame in session memory
            pivot_data = df.copy()
            
            # Ensure numeric values for metrics
            numeric_metrics = []
            for m in request.values:
                if pd.api.types.is_numeric_dtype(pivot_data[m]):
                    numeric_metrics.append(m)
                else:
                    logger.info(f"Metric {m} is not numeric, attempting auto-coercion.")
                    pivot_data[m] = pd.to_numeric(pivot_data[m], errors='coerce')
                    if not pivot_data[m].isna().all():
                        numeric_metrics.append(m)
                    else:
                        logger.warning(f"Metric {m} could not be coerced to numeric and contains only NaNs. Skipping.")
            
            if not numeric_metrics and request.agg_func != "count":
                raise ValueError("Aggregation requires numeric metrics (except for count).")

            pivot_df = pd.pivot_table(
                pivot_data,
                values=numeric_metrics if request.agg_func != "count" else pivot_data.columns[0],
                index=request.rows,
                columns=request.columns,
                aggfunc=func,
                fill_value=0
            )

            # 2. Flatten Multi-Index for JSON consumption
            # We want a format like: [{ row1: 'A', row2: 'B', col1: 'X', value: 100 }, ...]
            # reset_index makes rows into columns
            # melt makes columns into rows/values
            
            flattened = pivot_df.reset_index()
            
            # If we have multiple metrics and columns, melt becomes complex.
            # For simplicity, we'll convert the whole thing to a record-oriented list 
            # and let the frontend figure out the nesting, but a truly helpful API 
            # returns a ready-to-render list.
            
            # For now, let's use a standard 'to_dict(records)' on the index-flattened DF.
            # But wait, we need to handle the column MultiIndex names.
            
            data_records = []
            if isinstance(pivot_df.columns, pd.MultiIndex):
                # Flatten columns level by level
                # pivot_df.columns.names identifies the column dimensions
                # We iterate through the rows and values
                for row in pivot_df.itertuples():
                    row_data = {}
                    # Add row dimension values
                    if len(request.rows) == 1:
                        row_data[request.rows[0]] = row[0]
                    else:
                        for i, name in enumerate(request.rows):
                            row_data[name] = row[0][i]
                    
                    # Add metric values
                    for i, col_tuple in enumerate(pivot_df.columns):
                        # col_tuple is (Metric, ColDim1, ColDim2...)
                        val = row[i+1] # +1 because Index is at 0
                        
                        # Create a unique key for this cell
                        # e.g., "MetricX|DimValY|DimValZ"
                        key = "|".join([str(x) for x in col_tuple])
                        row_data[key] = float(val) if not np.isnan(val) else 0
                        
                    data_records.append(row_data)
            else:
                # Simple case: 1 metric or no column dims
                data_records = flattened.to_dict(orient='records')

            return PivotResult(
                session_id=session_id,
                data=data_records,
                row_dimensions=request.rows,
                col_dimensions=request.columns,
                metrics=request.values
            )

        except Exception as e:
            logger.error(f"Failed to generate pivot: {str(e)}")
            raise
