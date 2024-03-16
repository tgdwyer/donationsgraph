import * as d3 from 'd3';

class Link {
    constructor(public source: string, public target: string, public value: number) {}
};
class Node {
    constructor(public id: string, public value: number, public colour: string) {}
}

const infoBox = d3.select("body").append("div")
    .attr("class", "infoBox")
    .style("position", "absolute")
    .style("visibility", "hidden");

function dedupeLinks(unsortedlinks: Link[]) {
    const sortedlinks = unsortedlinks.sort((a, b) => a.source === b.source ? a.target.localeCompare(b.target) : a.source.localeCompare(b.source));
    const links = sortedlinks.reduce((a, l) => {
        const prev = a.length - 1;
        if (prev < 0 || a[prev].source !== l.source || a[prev].target !== l.target) {
            a.push(new Link(l.source, l.target, l.value));
        } else { a[prev].value += l.value }
        return a;
    }, [] as Link[]);
    return links;
}

function preciseMatch(a:string[], b:IterableIterator<string>) {
    const s = new Set(b);
    return a.length === s.size && a.every(e => s.has(e));
}
d3.csv('data/democracyforsaleFY2022.csv').then((data) => {
    const donorCategory: Map<string,string> = new Map();
    const getDonor = function(d:any) {
        const donor = d['Received From'];
        donorCategory.set(donor,d['Category']);
        return donor;
    }
    //const getDonor = (d:any) => d['Category'];
    const getRecipient = (d:any) => d['Party Group'] ? d['Party Group'] : d['Party (specific)'];
    const unsortedlinks: Link[] = 
      data.filter(d => d['Category']!='Individual'&&d['Category']!='Government')
          .map(d => ({source: getDonor(d), target: getRecipient(d), value: parseInt(d['Value'].replace(/,/g, ''))}));
    
    // map of donors and their recipients
    const donors = new Map<string,Map<string,number>>();
    unsortedlinks.forEach(l => {
        const donorId = l.source
        if (!donors.has(donorId)) {
            donors.set(donorId,new Map())
        }
        const recipients = donors.get(donorId)!
        const v = recipients.get(l.target) || 0;
        recipients.set(l.target,v + l.value)
    })

    const groupDonors: Map<string,string[]> = new Map();
    // group donors whose only recipients are a specific set of parties
    function groupDonorsTo(parties:string[]) {
        const donorKeys = Array.from(donors.keys())
        const recipientsForDonor = (donorId:string) => donors.get(donorId)!.keys()
        const donorGroup = new Set(donorKeys.filter(donor => preciseMatch(parties, recipientsForDonor(donor))))
        const groupName = parties + ' Donors'
        groupDonors.set(groupName,Array.from(donorGroup));
        unsortedlinks.forEach(l => {
            if(donorGroup.has(l.source)) {
                l.source = groupName
            }
        })
    }
    groupDonorsTo(['Labor'])
    groupDonorsTo(['Greens'])
    groupDonorsTo(['Lib Democrats'])
    groupDonorsTo(['One Nation'])
    groupDonorsTo(['Liberal/Nationals'])
    groupDonorsTo(['Labor','Liberal/Nationals'])
    
    function unhover() {
        infoBox.style("visibility", "hidden");
    }
    function hoverNode(event: { pageX: number; pageY: number; }, node: Node) {
        infoBox.html("");      
        infoBox.append("h1")
            .text(`${node.id}, $${node.value.toLocaleString()}`)
            .style("text-align", "center");

        if(donors.has(node.id)) {
            const recipients = donors.get(node.id);
            const table = infoBox.append('table');
            const tableHead = table.append('thead');
            const tableBody = table.append('tbody');
            const headRow = tableHead.append('tr');
            headRow.append('th').text('Recipient');
            headRow.append('th').text('Value').style('text-align', 'right');
            recipients!.forEach((value, key) => {
                const row = tableBody.append('tr');
                row.append('td').text(key);
                row.append('td').text(`$${value.toLocaleString()}`).style('text-align', 'right');
            })
        }

        if(groupDonors.has(node.id)) {
            const ds = groupDonors.get(node.id)!;
            
            let categoryTotals = new Map<string, number>();
            ds.forEach(d => {
                const recipients = donors.get(d);
                recipients!.forEach((value, recipient) => {
                    const categoryRecipient = donorCategory.get(d)+'|'+recipient;
                    const total = categoryTotals.get(categoryRecipient) || 0;
                    categoryTotals.set(categoryRecipient, total + value);
                });
            })
            const table = infoBox.append('table');
            const tableHead = table.append('thead');
            const tableBody = table.append('tbody');

            const headRow = tableHead.append('tr');
            headRow.append('th').text('Category');
            headRow.append('th').text('Recipient');
            headRow.append('th').text('Value').style('text-align', 'right');

            categoryTotals.forEach((value, key) => {
                const [category, recipient] = key.split('|');
                const row = tableBody.append('tr');
                row.append('td').text(category);
                row.append('td').text(recipient);
                row.append('td').text(`$${value.toLocaleString()}`).style('text-align', 'right');
            });
        }

        infoBox.style("visibility", "visible")
            .style("left", event.pageX + "px")
            .style("top", event.pageY + "px");
    }

    const links = dedupeLinks(unsortedlinks);

    const nodeMap: Map<string,Node> = new Map();

    function addNode(id: string, value: number, colour: string) {
        const node = nodeMap.get(id);
        if(node) {
            node.value += value;
        } else {
            const node = new Node(id, value, colour);
            nodeMap.set(id,node);
        }
    }
    links.forEach(l => {
        addNode(l.source,l.value, 'grey');
        const partyColour = l.target == 'Liberal/Nationals' ? 'blue' 
                      :l.target == 'Labor' ? 'red'
                      :l.target == 'Greens' ? 'green'
                      :'#fedb89';
        addNode(l.target,l.value, partyColour);
    })
    const nodes = Array.from(nodeMap.values());

    // Create a SVG container for the graph
    const svg = d3.select('body').append('svg')
        .attr('width', window.innerWidth)
        .attr('height', window.innerHeight);
    const container = svg.append('g');
    // Define the zoom behavior
    const zoom = d3.zoom()
        //.scaleExtent([1, 10]) // Adjust scale extent as needed
        .on('zoom', event => container.attr('transform', event.transform)); 

    // Create a D3 force simulation
    const simulation = d3.forceSimulation(nodes)
        .force('link', d3.forceLink(links).id(d => d.id).distance(100))
        .force('charge', d3.forceManyBody().strength(-100).distanceMax(400))
        .force('center', d3.forceCenter(window.innerWidth / 2, window.innerHeight / 2).strength(1.7));

    const scale = d3.scaleSqrt()
        .domain([0, d3.max(links, l => l.value)])
        .range([3, 20])
    // Create SVG elements for nodes and links
    const link = container.append('g')
        .selectAll('line')
        .data(links)
        .enter().append('line')
        .style('stroke-width', d => {;
            return scale(d.value);
        });
    // Function to handle node click event
    function pinNode(e: MouseEvent) {
        const circle = e.target as SVGCircleElement;
        const node = d3.select(circle).datum() as Node;
        if (node.pinned) {
            // Node is already pinned, unpin it
            node.fx = null;
            node.fy = null;
            node.pinned = false;
            d3.select(circle).style('stroke', 'none');
        } else {
            // Pin the node
            node.fx = node.x;
            node.fy = node.y;
            node.pinned = true;
            d3.select(circle).style('stroke', 'black');
            d3.select(circle).style('stroke-width', '1');
        }
        // Restart the simulation for the changes to take effect
        simulation.alpha(1).restart();
    }
    const node = container.append('g')
        .selectAll('circle')
        .data(nodes)
        .enter().append('circle')
        .attr('r', d => { 
            const r = scale(d.value);
            d.radius = r;
            return r;
        })
        .style('fill', d => d.colour)
        .call(<any>d3.drag()
            .on('start', dragStarted)
            .on('drag', dragged)
            .on('end', dragEnded))
        .on('click', pinNode)
        .on('mouseover', hoverNode)
        .on('mouseout', unhover);

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
        if (!d.pinned) {
            d.fx = null;
            d.fy = null;
        }
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
    
        // Apply the zoom behavior to the SVG
        svg.call(<any>zoom).call(<any>zoom.transform, d3.zoomIdentity.translate(tx,ty).scale(scale))
    });

    // Start the simulation
    simulation.alpha(1).restart();
}).catch((error) => {
    // Handle any errors that occur during the loading process
    console.error('Error loading CSV file:', error);
});

