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

      const node = { id, color, size, label, x, y, width, height } as Node;
      nodeLookup.set(id, node);
      return node;
    });

    // Extract edges
    const edges:Edge[] = Array.from(xmlDoc.getElementsByTagName("edge")).map(e => {
      const id = e.getAttribute("id");
      const source = e.getAttribute("source")!;
      const target = e.getAttribute("target")!;       
      const yNamespaceURI = 'http://www.yworks.com/xml/graphml';
      const innerPoints = Array.from(e.getElementsByTagNameNS(yNamespaceURI, "Point")).map(point => ({
          x: parseFloat(point.getAttribute("x")!),
          y: parseFloat(point.getAttribute("y")!)
      }));
      
      const value = parseFloat(e.querySelector("data[key='d12']")!.textContent || '1');
      const points = [{ x: nodeLookup.get(source)!.x, y: nodeLookup.get(source)!.y }, ...innerPoints, { x: nodeLookup.get(target)!.x, y: nodeLookup.get(target)!.y }];
      return { id, source: nodeLookup.get(source)!, target: nodeLookup.get(target)!, points, value } as Edge;
    });

    // Draw with D3
    const svg = d3.select("svg");
    const container = svg.append("g");

    const barChartContainer = d3.select("body").append("div")
      .attr("class", "bar-chart-container")
      .style("position", "absolute")
      .style("visibility", "hidden");

    const minValue = Math.min(...edges.map(e => e.value)), maxValue = Math.max(...edges.map(e => e.value));
    const minThickness = 1, maxThickness = 10;
    const edgeThicknessScale = d3.scaleLog().domain([minValue, maxValue]).range([minThickness, maxThickness]);

    function hoverNode(event: { pageX: string; pageY: string; }, node: Node) {
      // Get the edges connected to the node
      const connectedEdges = edges.filter(edge => edge.source.id === node.id || edge.target.id === node.id);
      connectedEdges.sort((a, b) => b.value - a.value);

      // Highlight edges
      container.selectAll('path.edge')
        .filter(edge => connectedEdges.includes(edge))
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
        .attr("x", (d, i) => i * (width / connectedEdges.length))
        .attr("y", d => height - logScale(d.value)) // Normalize height based on max value
        .attr("width", width / connectedEdges.length - barPadding)
        .attr("height", d => logScale(d.value) * height)
        .attr("fill", "blue"); // Adjust color as needed
      // Calculate the total value
      const totalValue = connectedEdges.reduce((sum, edge) => sum + edge.value, 0);

      // Add text for the total value
      barChartContainer.append("p")
          .text("Total: $" + totalValue.toLocaleString())
          .style("text-align", "center");
          
      // Position the bar chart container at the cursor position
      barChartContainer
        .style("left", event.pageX + "px")
        .style("top", event.pageY + "px")
        .style("visibility", "visible");
    }

    function unhover() {      
      // Remove edge highlight
      container.selectAll('path.edge')
        .classed('highlight', false);
      // Hide the bar chart container
      barChartContainer.style("visibility", "hidden");
    }
    // Draw edges
    container.selectAll("path.edge")
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
      .attr("stroke", "#000")
      .attr("stroke-opacity", 0.35) // Adjust the opacity as needed
      .attr("stroke-width", d => edgeThicknessScale(d.value))
      .attr("fill", "none");

    // Draw nodes
    container.selectAll("circle")
    .data(nodes)
    .enter()
    .append("circle")
    .attr("cx", d => d.x)
    .attr("cy", d => d.y)
    .attr("r", d => d.width / 2)
    .attr("fill", d => d.color)
    .on("mouseover", hoverNode)
    .on("mouseout", unhover);

    // Add labels
    const textSize = 10; // Adjust text size as needed
    const textElements = container.selectAll("text")
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
      maxX = nodes.reduce((max, node) => Math.max(max, node.x + node.width/2), 0)+border,
      maxY = nodes.reduce((max, node) => Math.max(max, node.y + node.height/2), 0)+border,
      minX = nodes.reduce((min, node) => Math.min(min, node.x - node.width/2), 0)-border,
      minY = nodes.reduce((min, node) => Math.min(min, node.y - node.height/2), 0)-border,
      graphWidth = maxX - minX,
      graphHeight = maxY - minY,
      scaleX = window.innerWidth / graphWidth,
      scaleY = window.innerHeight / graphHeight,
      initialScale = Math.min(scaleX, scaleY),
      tx = (window.innerWidth - graphWidth * initialScale)/2 - minX * initialScale,
      ty = (window.innerHeight - graphHeight * initialScale)/2 - minY * initialScale;
    
    svg
      .attr('width', graphWidth)
      .attr('height', graphHeight);
    
    // Define the zoom behavior
    const zoom = d3.zoom()
      //.scaleExtent([1, 10]) // Adjust scale extent as needed
      .on('zoom', (event) => {
        container.attr('transform', event.transform);
      }); 
    // Apply the zoom behavior to the SVG
    svg.call(zoom).call(zoom.transform, d3.zoomIdentity.translate(tx,ty).scale(initialScale))


  } catch (error) {
      console.error("Error loading or parsing GraphML:", error);
  }
}

// Load the GraphML file
loadGraphML("data/donations_yed_2019.graphml");

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