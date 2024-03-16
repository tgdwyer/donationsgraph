import * as d3 from 'd3';

d3.csv('data/democracyforsaleFY2022.csv').then((data) => {
    const getParty = (d:any) => d['Party Group'] ? d['Party Group'] : d['Party (specific)'];
    class Link {
        constructor(public source: string, public target: string, public value: number) {}
    };
    class Node {
        constructor(public id: string, public value: number, public colour: d3.Color) {}
    }
    const unsortedlinks: Link[] = data.map(d => ({source: d['Category'], target: getParty(d), value: parseInt(d['Value'].replace(/,/g, ''))}));
    const sortedlinks = unsortedlinks.sort((a, b) => a.source === b.source ? a.target.localeCompare(b.target) : a.source.localeCompare(b.source));
    const links = sortedlinks.reduce((a, l) => {
        const prev = a.length - 1;
        if (prev<0 || a[prev].source !== l.source || a[prev].target !== l.target) {
            a.push(new Link(l.source,l.target,l.value));
        } else {
            a[prev].value += l.value;
        }
        return a;
    },[] as Link[])
    const nodeMap: Map<string,Node> = new Map();

    function addNode(source: string, value: number, colour: string) {
        const node = nodeMap.get(source);
        if(node) {
            node.value += value;
        } else {
            const node = new Node(source, value, d3.color(colour)!);
            nodeMap.set(source,node);
        }
    }
    links.forEach(l => {
        addNode(l.source,l.value, 'grey');
        const colour = l.target == 'Liberal/Nationals' ? 'blue' 
                      :l.target == 'Labor' ? 'red'
                      :l.target == 'Greens' ? 'green'
                      :'#fedb89';
        addNode(l.target,l.value, colour);
    })
    const nodes = Array.from(nodeMap.values());

    // Create a SVG container for the graph
    const svg = d3.select('body').append('svg')
        .attr('width', window.innerWidth)
        .attr('height', window.innerHeight);
    const container = svg.append('g');

    // Create a D3 force simulation
    const simulation = d3.forceSimulation(nodes)
        .force('link', d3.forceLink(links).id(d => d.id).distance(200))
        .force('charge', d3.forceManyBody().strength(-900))
        .force('center', d3.forceCenter(window.innerWidth / 2, window.innerHeight / 2));

    const scale = d3.scaleLinear()
        .domain([0, d3.max(links, l => l.value)])
        .range([1, 10])
    // Create SVG elements for nodes and links
    const link = container.append('g')
        .selectAll('line')
        .data(links)
        .enter().append('line')
        .style('stroke-width', d => {;
            return scale(d.value);
        });

    const node = container.append('g')
        .selectAll('circle')
        .data(nodes)
        .enter().append('circle')
        .attr('r', d => { 
            const r = 5 + scale(d.value);
            d.radius = r;
            return r;
        })
        .call(d3.drag()
            .on('start', dragStarted)
            .on('drag', dragged)
            .on('end', dragEnded))
        .style('fill', d => d.colour.toString());

    function dragStarted(event, d) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
    }

    function dragged(event, d) {
        d.fx = event.x;
        d.fy = event.y;
    }

    function dragEnded(event, d) {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
    }

    // Add labels to the nodes
    const labels = container.append('g')
        .selectAll('text')
        .data(nodes)
        .enter().append('text')
        .text(d => d.id)
        .attr('x', d => d.x + 10)
        .attr('y', d => d.y + 5);

    // Define the behavior of the nodes and links in the simulation
    simulation.on('tick', () => {
        link.attr('x1', d => d.source.x)
            .attr('y1', d => d.source.y)
            .attr('x2', d => d.target.x)
            .attr('y2', d => d.target.y);

        node.attr('cx', d => d.x)
            .attr('cy', d => d.y);
            
        labels.attr('x', d => d.x + 10)
            .attr('y', d => d.y + 5);
        
    });
    simulation.on('end', () => {
        const border = 10,
            [windowWidth, windowHeight] = [window.innerWidth, window.innerHeight],
            maxX = Math.max(...Array.from(labels.nodes()).map(l => l.getBBox().x + l.getBBox().width + border)),
            maxY = Math.max(...nodes.map(v => v.y + v.radius))+border,
            minX = Math.min(...nodes.map(v => v.x - v.radius))-border,
            minY = Math.min(...nodes.map(v => v.y - v.radius))-border,
            [graphWidth, graphHeight] = [maxX - minX, maxY - minY],
            [scaleX, scaleY] = [windowWidth / graphWidth, windowHeight / graphHeight],
            scale = Math.min(scaleX, scaleY),
            [scaledGraphWidth, scaledGraphHeight] = [graphWidth, graphHeight].map(v => v*scale),
            [centerOffsetX, centerOffsetY] = [windowWidth - scaledGraphWidth, windowHeight - scaledGraphHeight].map(v=>v/2),
            [windowMinX, windowMinY] = [minX, minY].map(v => v*scale),
            [tx, ty] = [centerOffsetX - windowMinX, centerOffsetY - windowMinY];
    
        // Define the zoom behavior
        const zoom = d3.zoom()
            //.scaleExtent([1, 10]) // Adjust scale extent as needed
            .on('zoom', event => container.attr('transform', event.transform)); 
        // Apply the zoom behavior to the SVG
        svg.call(<any>zoom).call(<any>zoom.transform, d3.zoomIdentity.translate(tx,ty).scale(scale))
    });

    // Start the simulation
    simulation.alpha(1).restart();
}).catch((error) => {
    // Handle any errors that occur during the loading process
    console.error('Error loading CSV file:', error);
});
