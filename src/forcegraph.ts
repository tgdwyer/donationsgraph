import * as d3 from 'd3';

d3.csv('data/democracyforsaleFY2022.csv').then((data) => {
    const getParty = (d:any) => d['Party Group'] ? d['Party Group'] : d['Party (specific)'];
    const nodes = Array.from(new Set(data.flatMap(d => [d['Category'], getParty(d)])), id => ({id}));
    type Link = {source: string, target: string, value: number};
    const unsortedlinks: Link[] = data.map(d => ({source: d['Category'], target: getParty(d), value: parseInt(d['Value'].replace(/,/g, ''))}));
    const sortedlinks = unsortedlinks.sort((a, b) => a.source === b.source ? a.target.localeCompare(b.target) : a.source.localeCompare(b.source));
    const links = sortedlinks.reduce((a, l) => {
        if (a.length === 0 || a[a.length - 1].source !== l.source || a[a.length - 1].target !== l.target) {
            a.push(l);
        } else {
            a[a.length - 1].value += l.value;
        }
        return a;
    },[] as Link[])

    console.log(links)
    // Create a SVG container for the graph
    const svg = d3.select('body').append('svg')
        .attr('width', window.innerWidth)
        .attr('height', window.innerHeight);

    // Create a D3 force simulation
    const simulation = d3.forceSimulation(nodes)
        .force('link', d3.forceLink(links).id(d => d.id).distance(200))
        .force('charge', d3.forceManyBody().strength(-900))
        .force('center', d3.forceCenter(window.innerWidth / 2, window.innerHeight / 2));

    const scale = d3.scaleLinear()
        .domain([0, d3.max(links, l => l.value)])
        .range([1, 10])
    // Create SVG elements for nodes and links
    const link = svg.append('g')
        .selectAll('line')
        .data(links)
        .enter().append('line')
        .style('stroke-width', d => {;
            return scale(d.value);
        });

    const node = svg.append('g')
        .selectAll('circle')
        .data(nodes)
        .enter().append('circle')
        .attr('r', 5)
        .call(d3.drag()
            .on('start', dragStarted)
            .on('drag', dragged)
            .on('end', dragEnded));

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
    const labels = svg.append('g')
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

    // Start the simulation
    simulation.alpha(1).restart();
}).catch((error) => {
    // Handle any errors that occur during the loading process
    console.error('Error loading CSV file:', error);
});