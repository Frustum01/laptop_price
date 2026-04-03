import pandas as pd
import json
import sys

def apply_filters(data, filters):
    df = pd.DataFrame(data)

    for key, value in filters.items():
        if isinstance(value, list):
            df = df[df[key].isin(value)]
        elif isinstance(value, dict):
            df = df[(df[key] >= value["min"]) & (df[key] <= value["max"])]

    return df


def generate_chart(df, x, y):
    result = df.groupby(x)[y].sum().reset_index()
    return result.to_dict(orient="records")


if __name__ == "__main__":
    input_json = json.loads(sys.argv[1])

    data = input_json["data"]
    filters = input_json["filters"]
    x = input_json["x"]
    y = input_json["y"]

    filtered_df = apply_filters(data, filters)
    chart_data = generate_chart(filtered_df, x, y)

    print(json.dumps(chart_data))