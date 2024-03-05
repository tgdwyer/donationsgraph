import * as d3 from 'd3';

// Extract and process the data
type Node = {
  id: string;
  color: string;
  size: number;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  edges: Edge[];
  value: number;
}
type Edge = {
  id: string;
  source: Node;
  target: Node;
  points: { x: number, y: number }[];
  value: number;
}

// Function to load and parse the GraphML file
async function loadGraphML(url:string) {
  try {
    // Fetch the GraphML file
    const response = await fetch(url);
    const text = await response.text();

    // Parse the XML
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(text, "text/xml");

    const nodeLookup = new Map<string,Node>();

    // Extract nodes
    const nodes : Node[] = Array.from(xmlDoc.getElementsByTagName("node")).map(v => {
      const id = v.getAttribute("id")!;
      const color = v.querySelector("data[key='d3']")!.textContent;
      const size = parseFloat(v.querySelector("data[key='d4']")!.textContent || '0');
      const label = v.querySelector("data[key='d6']")!.textContent;
      // Assuming the namespace URI for the 'y' prefix is 'http://www.yworks.com/xml/graphml'
      const yNamespaceURI = 'http://www.yworks.com/xml/graphml';

      // Use getElementsByTagNameNS to select the <y:Geometry> element
      const geometryElements = v.getElementsByTagNameNS(yNamespaceURI, 'Geometry');
      const geometry = geometryElements.length > 0 ? geometryElements[0] : null;

      // Now you can use the geometry element as before
      const width = geometry ? parseFloat(geometry.getAttribute("width")!) : 0;
      const height = geometry ? parseFloat(geometry.getAttribute("height")!) : 0;
      const x = (geometry ? parseFloat(geometry.getAttribute("x")!) : 0) + width / 2;
      const y = (geometry ? parseFloat(geometry.getAttribute("y")!) : 0) + height / 2;

      const node = { id, color, size, label, x, y, width, height, edges: [], value: 0 } as Node;
      nodeLookup.set(id, node);
      return node;
    });

    // Extract edges
    const edges:Edge[] = Array.from(xmlDoc.getElementsByTagName("edge")).map(e => {
      const id = e.getAttribute("id");
      const source = e.getAttribute("source")!,
            target = e.getAttribute("target")!,
            sourceNode = nodeLookup.get(source)!,
            targetNode = nodeLookup.get(target)!;
      const yNamespaceURI = 'http://www.yworks.com/xml/graphml';
      const innerPoints = Array.from(e.getElementsByTagNameNS(yNamespaceURI, "Point")).map(point => ({
          x: parseFloat(point.getAttribute("x")!),
          y: parseFloat(point.getAttribute("y")!)
      }));
      
      const value = parseFloat(e.querySelector("data[key='d12']")!.textContent || '1');
      const points = [{ x: sourceNode.x, y: sourceNode.y }, ...innerPoints, { x: targetNode.x, y: targetNode.y }];
      const edge = { id, source: sourceNode, target: targetNode, points, value } as Edge;
      sourceNode.edges.push(edge);
      targetNode.edges.push(edge);
      sourceNode.value += value;
      targetNode.value += value;
      return edge;
    });

    // Draw with D3
    const svg = d3.select("svg");
    const container = svg.append("g");
    const edgeContainer = container.append("g");
    const nodeContainer = container.append("g");

    const barChartContainer = d3.select("body").append("div")
      .attr("class", "bar-chart-container")
      .style("position", "absolute")
      .style("visibility", "hidden");

    const minThickness = 1, maxThickness = 40;
    const edgeThicknessScale = 
      d3.scaleSqrt()
        .domain([Math.min(...edges.map(e => e.value)), Math.max(...edges.map(e => e.value))])
        .range([minThickness, maxThickness]);

    const minNodeRadius = 15, maxNodeRadius = 40;
    const nodeSizeScale =
      d3.scaleSqrt()
        .domain([Math.min(...nodes.map(n => n.value)), Math.max(...nodes.map(n => n.value))])
        .range([minNodeRadius, maxNodeRadius]);

    function hoverNode(event: { pageX: string; pageY: string; }, node: Node) {
      // Get the edges connected to the node
      const connectedEdges = node.edges;
      connectedEdges.sort((a, b) => b.value - a.value);
      const neighborNodes = [node].concat(connectedEdges.map(edge => edge.source.id === node.id ? edge.target : edge.source));

      // Highlight edges
      const highlightedEdges = edgeContainer.selectAll('path.edge')
          .filter(edge => connectedEdges.includes(<Edge>edge))
          .classed('highlight', true);

      highlightedEdges.each(function() {
          // Select the current edge
          const edge = d3.select(this);
          // Append the edge to its parent to bring it to the top
          const parentNode = (edge.node() as Element)?.parentNode;
          if (parentNode) {
            parentNode.appendChild(edge.node() as Element);
          }
      });

      // Highlight neighbor nodes
      nodeContainer.selectAll('circle.node')
          .filter(node => neighborNodes.includes(<Node>node))
          .classed('highlight', true);

      // Clear any existing content in the bar chart container
      barChartContainer.html("");

      // Add the node label as the title of the bar chart container
      barChartContainer.append("h1")
        .text(node.label)
        .style("text-align", "center");

      // Get the minimum and maximum values from the data
      const minValue = d3.min(connectedEdges, d => d.value);
      const maxValue = d3.max(connectedEdges, d => d.value);

      // Add text for the maximum value
      barChartContainer.append("p")
          .text("Max: $" + maxValue!.toLocaleString())
          .style("text-align", "left");

      // Add text for the minimum value
      barChartContainer.append("p")
          .text("Min: $" + minValue!.toLocaleString())
          .style("text-align", "right");
    
      // Set dimensions for the bar chart
      const width = 100; // Adjust as needed
      const height = 50; // Adjust as needed
      const barPadding = 0; // Adjust as needed
      const logScale = d3.scaleLog()
          .domain([1, maxValue!]) // Log scale starts at 1 (log(0) is undefined)
          .range([0, height]);
      // Create an SVG element for the bar chart
      const svg = barChartContainer.append("svg")
        .attr("width", width)
        .attr("height", height);
    
      // Create bars for each edge value
      svg.selectAll("rect")
        .data(connectedEdges)
        .enter()
        .append("rect")
        .attr("x", (_, i) => i * (width / connectedEdges.length))
        .attr("y", d => height - logScale(d.value)) // Normalize height based on max value
        .attr("width", width / connectedEdges.length - barPadding)
        .attr("height", d => logScale(d.value) * height)
        .attr("fill", "blue"); // Adjust color as needed

      // Add text for the total value
      barChartContainer.append("p")
          .text("Total: $" + node.value.toLocaleString())
          .style("text-align", "center");
          
      // Position the bar chart container at the cursor position
      barChartContainer
        .style("left", event.pageX + "px")
        .style("top", event.pageY + "px")
        .style("visibility", "visible");
    }

    function unhover() {      
      // Remove edge highlight
      edgeContainer.selectAll('path.edge')
        .classed('highlight', false);
      nodeContainer.selectAll('circle.node')
        .classed('highlight', false);
      // Hide the bar chart container
      barChartContainer.style("visibility", "hidden");
    }
    // Draw edges
    edgeContainer.selectAll("path.edge")
      .data(edges)
      .enter()
      .append("path")
      .attr("class", "edge")
      .attr("d", d => {
          const path = d3.path();
          d.points.forEach((point, i) => {
              if (i === 0) {
                  path.moveTo(point.x, point.y);
              } else {
                  path.lineTo(point.x, point.y);
              }
          });
          return path.toString();
      })
      .attr("stroke", d => d.target.color)
      .attr("stroke-opacity", 0.35) // Adjust the opacity as needed
      .attr("stroke-width", d => edgeThicknessScale(d.value))
      .attr("fill", "none");

      
    // Draw nodes
    nodeContainer.selectAll("circle")
    .data(nodes)
    .enter()
    .append("circle")
    .attr("class", "node")
    .attr("cx", d => d.x)
    .attr("cy", d => d.y)
    .attr("r", d => nodeSizeScale(d.value))
    .attr("fill", d => d.color)
    .on("mouseover", hoverNode)
    .on("mouseout", unhover);

    // Add labels
    const textSize = 10; // Adjust text size as needed
    const textElements = nodeContainer.selectAll("text")
      .data(nodes)
      .enter()
      .append("text")
      .attr("x", d => d.x)
      .attr("y", d => d.y)
      .attr("text-anchor", "middle")
      .style("font-size", textSize + "px")
      .style("pointer-events", "none");
  
    textElements.each(function(d) {
      const 
        lines = d.label.split("\n"),
        lineHeight = textSize,
        yOffset = textSize/3-(lines.length - 1) * lineHeight / 2; // Center the text block vertically
  
      lines.forEach((line, i) => {
          d3.select(this)
              .append("tspan")
              .attr("x", d.x)
              .attr("dy", i === 0 ? yOffset : lineHeight) // Adjust the vertical position of each line
              .text(line);
      });
    });

    const 
      border = 50,
      maxX = nodes.reduce((m, node) => Math.max(m, node.x + node.width/2), 0)+border,
      maxY = nodes.reduce((m, node) => Math.max(m, node.y + node.height/2), 0)+border,
      minX = nodes.reduce((m, node) => Math.min(m, node.x - node.width/2), 0)-border,
      minY = nodes.reduce((m, node) => Math.min(m, node.y - node.height/2), 0)-border,
      graphWidth = maxX - minX,
      graphHeight = maxY - minY,
      scaleX = window.innerWidth / graphWidth,
      scaleY = window.innerHeight / graphHeight,
      initialScale = Math.min(scaleX, scaleY),
      tx = (window.innerWidth - graphWidth * initialScale)/2 - minX * initialScale,
      ty = (window.innerHeight - graphHeight * initialScale)/2 - minY * initialScale;
    
    svg
      .attr('width', window.innerWidth)
      .attr('height', window.innerHeight);
    
    // Define the zoom behavior
    const zoom = d3.zoom()
      //.scaleExtent([1, 10]) // Adjust scale extent as needed
      .on('zoom', (event) => {
        container.attr('transform', event.transform);
      }); 
    // Apply the zoom behavior to the SVG
    svg.call(<any>zoom).call(<any>zoom.transform, d3.zoomIdentity.translate(tx,ty).scale(initialScale))


  } catch (error) {
      console.error("Error loading or parsing GraphML:", error);
  }
}

// Load the GraphML file
loadGraphML("data/donations_yed_2015.graphml");
//loadGraphML("data/donations_yed_2023.graphml");

// const svgObj = document.getElementById('svg-object');
// if (svgObj === null) {
//   throw new Error('SVG object not found');
// }
// svgObj.addEventListener('load', function() {
//   console.log('SVG loaded')
//   const svgDoc = this.contentDocument; // Get the SVG document
  
//   const d3svg = d3.select(svgDoc).select('svg'); // Use D3 to select the SVG document
//   const container = d3svg.select('g'); // Select the <g> element
//   d3svg.selectAll("text")
//   .style("pointer-events", "none");

//   //container.attr('transform', `translate(0,0) scale(${window.innerWidth/getWidth(svgDoc)})`);
//   // Define the zoom behavior
//   const zoom = d3.zoom()
//     //.scaleExtent([1, 10]) // Adjust scale extent as needed
//     .on('zoom', (event) => {
//       container.attr('transform', event.transform);
//     });
//   // Apply the zoom behavior to the SVG
//   d3svg.call(zoom).call(zoom.transform, d3.zoomIdentity.scale(window.innerWidth/getWidth(svgDoc)))

//   d3svg.selectAll('circle')
//       .on('mouseenter', function() {
//           d3.select(this).attr('r', function() {
//               const currentRadius = parseFloat(d3.select(this).attr('r'));
//               return currentRadius + 5; // Increase radius by 5 on hover
//           });
//       })
//       .on('mouseleave', function() {
//           d3.select(this).attr('r', function() {
//               const currentRadius = parseFloat(d3.select(this).attr('r'));
//               return currentRadius - 5; // Decrease radius back to original on mouse leave
//           });
//       });
// });

// function getWidth(d) {
//   var svgObject = document.getElementById('svg-object');
//   var svgDocument = svgObject.contentDocument;

//   if (svgDocument) {
//       var svgElement = svgDocument.documentElement;
//       var bbox = svgElement.getBBox();
//       return bbox.width;
//   }
//   return 0;
// }

// window.addEventListener('resize', resizeSVG);
// window.addEventListener('load', resizeSVG);