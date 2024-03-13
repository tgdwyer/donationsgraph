import pandas as pd
df = pd.read_csv('donors_output.csv',on_bad_lines='warn')
pd.set_option('display.max_rows', None)
distinct_values = df['Industry Sector'].unique()
for i in distinct_values:
    print(i)