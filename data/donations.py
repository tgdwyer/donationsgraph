import pandas as pd
import networkx as nx
import numpy as np
import textwrap
import xml.etree.ElementTree as ET

# Read Excel file
df = pd.read_excel('Annual Donations Made.xlsx')

# Replace occurrences
replacements = {
    'Climate.*200': 'Climate 200',
    'not.*race': 'Not A Race',
    'advance.*australia': 'Advance Australia',
    'pauline.*hanson': 'Pauline Hanson',
    'one.*nation': 'Pauline Hanson',
    'David.*Pocock': 'David Pocock',
    'allegra': 'Ms Allegra Spender MP',
    'getup': 'Getup Ltd',
    'Labor.*western': 'ALP-WA',
    'ALP.*WA': 'ALP-WA',
    'Labor.*northern': 'ALP-NT',
    'Labor.*vic': 'ALP-VIC',
    'Labor.*queen': 'ALP-QLD',
    'Labor.*south': 'ALP-SA',
    'Labor.*N\.S\.W': 'ALP-NSW',
    'ALP.*NSW': 'ALP-NSW',
    'ALP.*VIC': 'ALP-VIC',
    'ALP.*Q': 'ALP-QLD',
    'ALP.*FED': 'ALP-FED',
    'Australian Labor Party': 'ALP-FED',
    'ALP.*NAT': 'ALP-FED',

    'lib.*vic': 'LIB-VIC',
    'lib.*tas': 'LIB-TAS',
    'lib.*nsw': 'LIB-NSW',
    'lib.*act': 'LIB-ACT',
    'lib.*q': 'LIB-QLD',
    'lnp.*q': 'LIB-QLD',
    'lib.*S\.A': 'LIB-SA',
    'lib.*W\.?A': 'LIB-WA',
    'lib.*N\.S\.W': 'LIB-NSW',
    'lib.*party': 'LIB-FED',
    'lib.*fed': 'LIB-FED',

    'NAT.*vic': 'NAT-VIC',
    'NAT.*tas': 'NAT-TAS',
    'NAT.*nsw': 'NAT-NSW',
    'NAT.*act': 'NAT-ACT',
    'NAT.*q': 'NAT-QLD',
    'NAT.*S\.A': 'NAT-SA',
    'NAT.*W\.?A': 'NAT-WA',
    'NAT.*N\.S\.W': 'NAT-NSW',
    'NAT.*AUS': 'NAT-FED',


    'GREEN.*vic': 'GREEN-VIC',
    'GREEN.*tas': 'GREEN-TAS',
    'GREEN.*nsw': 'GREEN-NSW',
    'GREEN.*act': 'GREEN-ACT',
    'GREEN.*q': 'GREEN-QLD',
    'q.*GREEN': 'GREEN-QLD',
    'GREEN.*S\.A': 'GREEN-SA',
    'GREEN.*W\.?A': 'GREEN-WA',
    'GREEN.*N\.S\.W': 'GREEN-NSW',
    'GREEN.*AUS': 'GREEN-FED',

    'AUS.*GREEN': 'GREEN-FED'
}

# Federal election year 2022-23
#filtered_df = df[df['Financial Year'] == '2021-22'].groupby(['Donor Name', 'Donation Made To'])['Amount'].sum().reset_index()
#filtered_df = df[df['Financial Year'] == '2018-19'].groupby(['Donor Name', 'Donation Made To'])['Amount'].sum().reset_index()
#filtered_df = df[df['Financial Year'] == '2022-23'].groupby(['Donor Name', 'Donation Made To'])['Amount'].sum().reset_index()
filtered_df = df[df['Financial Year'] == '2014-15'].groupby(['Donor Name', 'Donation Made To'])['Amount'].sum().reset_index()


for pattern, replacement in replacements.items():
    filtered_df['Donation Made To'] = filtered_df['Donation Made To'].str.replace(r'(?i).*' + pattern + '.*', replacement, regex=True)

# Create a directed graph
G = nx.DiGraph()

# Add edges and edge weights (donation amounts)
for index, row in filtered_df.iterrows():
    G.add_edge(row['Donor Name'], row['Donation Made To'], weight=row['Amount'])

# Calculate total donations given and received
donations_given = filtered_df.groupby('Donor Name')['Amount'].sum().to_dict()
donations_received = filtered_df.groupby('Donation Made To')['Amount'].sum().to_dict()

# Calculate total donations for each node for sizing
total_donations = {**donations_given, **donations_received}  # Merge two dictionaries
min_size, max_size = 10, 100  # Adjust for yEd size compatibility
size_range = max_size - min_size
min_donation, max_donation = min(total_donations.values()), max(total_donations.values())
sqrt_min_donation, sqrt_max_donation = np.sqrt(min_donation), np.sqrt(max_donation)
scaled_sizes = {node: min_size + (size_range * ((np.sqrt(total_donations.get(node, 0)) - sqrt_min_donation) / (sqrt_max_donation - sqrt_min_donation))) for node in G.nodes()}

# Normalize edge weights for thickness
all_weights = [data['weight'] for _, _, data in G.edges(data=True)]
min_weight, max_weight = min(all_weights), max(all_weights)
scaled_weights = [1 + 9 * (weight - min_weight) / (max_weight - min_weight) for weight in all_weights]

# Assign node attributes for label, size, and color
for node in G.nodes():
    G.nodes[node]['label'] = '\n'.join(textwrap.wrap(node, width=12))  # Node names as labels
    G.nodes[node]['size'] = scaled_sizes.get(node, min_size)  # Assign scaled size
    G.nodes[node]['amount'] = total_donations.get(node, 0)  # Total donations for tooltip
    G.nodes[node]['color'] = '#c0c0c0' if node in donations_given else '#ffcc00'  # Hex color for yEd
    if "lib-" in node.lower():
        G.nodes[node]['color'] = '#1e90ff'
    elif "nat-" in node.lower():
        G.nodes[node]['color'] = '#3366ff'
    elif "alp-" in node.lower():
        G.nodes[node]['color'] = '#ff6600'
    elif "green-" in node.lower():
        G.nodes[node]['color'] = '#32cd32'

# Assign edge attributes for thickness based on donation amount
for i, (u, v) in enumerate(G.edges()):
    G[u][v]['thickness'] = scaled_weights[i]  # Use index to assign corresponding scaled weight

# Export to GraphML
nx.write_graphml(G, "donations.graphml")

# === Post-processing to add yEd specific visual attributes === #

# Register namespaces to preserve structure and prefixes
namespaces = {
    'graphml': 'http://graphml.graphdrawing.org/xmlns',
    'y': 'http://www.yworks.com/xml/graphml'
}
for ns_prefix, ns_uri in namespaces.items():
    ET.register_namespace(ns_prefix, ns_uri)

tree = ET.parse('donations.graphml')
root = tree.getroot()
# Check if the key element already exists to avoid duplicates
key_exists = any(key.attrib.get('id') == 'd6' for key in root.findall('graphml:key', namespaces))

# If the key does not exist, add it
if not key_exists:
    key_element = ET.Element("{http://graphml.graphdrawing.org/xmlns}key", attrib={
        "for": "node",
        "id": "d6",
        "yfiles.type": "nodegraphics"
    })
    # Insert the key element before the graph element
    root.insert(0, key_element)  # Inserts at the beginning, before the first child element

# Function to create yEd style node
def create_yed_node_style(node, size, color):
    data_element = node.find('graphml:data[@key="d6"]', namespaces)
    if data_element is None:
        data_element = ET.SubElement(node, '{http://graphml.graphdrawing.org/xmlns}data', key='d6')
    shapenode_element = ET.SubElement(data_element, '{http://www.yworks.com/xml/graphml}ShapeNode')
    ET.SubElement(shapenode_element, '{http://www.yworks.com/xml/graphml}Geometry', height=str(size), width=str(size), x="0", y="0")
    ET.SubElement(shapenode_element, '{http://www.yworks.com/xml/graphml}Fill', color=color, transparent="false")
    ET.SubElement(shapenode_element, '{http://www.yworks.com/xml/graphml}NodeLabel', alignment="center", autoSizePolicy="content", fontFamily="Dialog", fontSize="12", fontStyle="plain", hasBackgroundColor="false", hasLineColor="false", height="4", modelName="custom", textColor="#000000", visible="true").text = node.get('id')
    ET.SubElement(shapenode_element, '{http://www.yworks.com/xml/graphml}Shape', type="ellipse")

for node in G.nodes(data=True):
    xml_node = root.find(f".//graphml:node[@id='{node[0]}']", namespaces)
    if xml_node is not None:
        create_yed_node_style(xml_node, node[1]['size'], node[1]['color'])

tree.write('donations_yed.graphml', encoding='utf-8', xml_declaration=True)
