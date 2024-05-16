import * as d3 from 'd3';
import * as d3Sankey from 'd3-sankey';

class Link {
    constructor(public source: string, public target: string, public value: number) { }
};
class Node {
    constructor(public id: string, public value: number, public colour: string) { }
}

const infoBox = d3.select("body").append("div")
    .attr("class", "infoBox")
    .style("position", "absolute")
    .style("visibility", "hidden");
const detailsBox = d3.select("body").append("div")
    .attr("class", "infoBox")
    .style("background-color", "beige")
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

function preciseMatch(a: string[], b: IterableIterator<string>) {
    const s = new Set(b);
    return a.length === s.size && a.every(e => s.has(e));
}
d3.csv('data/democracyforsaleFY2022.csv').then((data) => {
    const donorCategory: Map<string, string> = new Map();
    const getDonor = function (d: any) {
        const donor = d['Received From'];
        donorCategory.set(donor, d['Category']);
        return donor;
    }
    //const getDonor = (d:any) => d['Category'];
    const getRecipient = (d: any) => d['Party Group'] ? d['Party Group'] : d['Party (specific)'];
    const unsortedlinks: Link[] =
        data.filter(d => d['Category'] != 'Individual' && d['Category'] != 'Government')
            .map(d => ({ source: getDonor(d), target: getRecipient(d), value: parseInt(d['Value'].replace(/,/g, '')) }));

    // map of donors and their recipients
    const donors = new Map<string, Map<string, number>>();
    unsortedlinks.forEach(l => {
        const donorId = l.source
        if (!donors.has(donorId)) {
            donors.set(donorId, new Map())
        }
        const recipients = donors.get(donorId)!
        const v = recipients.get(l.target) || 0;
        recipients.set(l.target, v + l.value)
    })

    const groupDonors: Map<string, string[]> = new Map();
    // group donors whose only recipients are a specific set of parties
    function groupDonorsTo(parties: string[]) {
        const donorKeys = Array.from(donors.keys())
        const recipientsForDonor = (donorId: string) => donors.get(donorId)!.keys()
        const donorGroup = new Set(donorKeys.filter(donor => preciseMatch(parties, recipientsForDonor(donor))))
        const groupName = parties + ' Donors'
        groupDonors.set(groupName, Array.from(donorGroup));
        unsortedlinks.forEach(l => {
            if (donorGroup.has(l.source)) {
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
    function getPartyColour(party: string) {
        return party == 'Liberal/Nationals' ? 'blue'
            : party == 'Labor' ? 'red'
                : party == 'Greens' ? 'green'
                    : '#f4a581';
    }
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            unhover();
        }
    });
    function createTable(
        div: any,
        columnTitles: string[],
        rowData: { rowTitle: string, values: number[] }[],
        colourBy: 'ColumnTitles' | 'RowTitles' = 'ColumnTitles') {
        // sort rowData by sum of value largest to smallest
        rowData.sort((a, b) => b.values.reduce((a, b) => a + b) - a.values.reduce((a, b) => a + b));
        const maxValue = Math.max(...rowData[0].values);
        const table = div.append('table');
        const tableHead = table.append('thead');
        const tableBody = table.append('tbody');
        const headRow = tableHead.append('tr');
        columnTitles.forEach(title => headRow.append('th').text(title).style('text-align', 'left'));
        const rowSelection = tableBody.selectAll('tr')
            .data(rowData)
            .enter()
            .append('tr')
            .each(function (this: HTMLTableRowElement, d) {
                const row = d3.select(this);
                row.append('td').text(d.rowTitle).style('text-align', 'left');
                d.values.forEach(v =>
                    row.append('td').style('text-align', 'right')
                        .append('div')
                        .style('position', 'relative')
                        .text(`$${v.toLocaleString()}`));
            })
            .each(function (this: HTMLTableRowElement, d) {
                const cells = d3.select(this).selectAll('td').filter((_, i) => i > 0);
                let minValColWidth = Math.min(...cells.nodes().map((c: any) => c.getBoundingClientRect().width))
                cells.each(function (this: any, d: any, i: number) {
                    const cell = d3.select(this),
                        cellWidth = cell.node()!.getBoundingClientRect().width,
                        colour = getPartyColour(colourBy === 'ColumnTitles'
                            ? columnTitles[i + 1] : d.rowTitle),
                        v = d.values[i],
                        barWidth = minValColWidth * v / maxValue;
                    cell.select('div').append('div')
                        .style('width', `${barWidth}px`)
                        .style('height', '100%')
                        .style('background-color', colour)
                        .style('opacity', '0.3')
                        .style('position', 'absolute')
                        .style('top', '0')
                        .style('left', i > 0 ? '0px' : `${cellWidth - barWidth}px`);
                })
            });
        return rowSelection;
    }
    function hoverNode(event: MouseEvent, node: Node) {
        event.stopPropagation();
        infoBox.html("");
        infoBox.append("h1")
            .text(`${node.id}: $${node.value.toLocaleString()}`)
            .style("text-align", "center");

        if (donors.has(node.id)) {
            const recipients = donors.get(node.id)!;
            createTable(infoBox,
                ['Recipient', 'Value'],
                Array.from(recipients).map(([key, value]) => ({ rowTitle: key, values: [value] })),
                'RowTitles')
        }

        if (groupDonors.has(node.id)) {
            const ds = groupDonors.get(node.id)!;

            const categoryTotals = new Map<string, Map<string, number>>();
            const groupRecipients = new Set<string>();
            ds.forEach(d => {
                const recipients = donors.get(d);
                recipients!.forEach((value, recipient) => {
                    groupRecipients.add(recipient);
                    const category = donorCategory.get(d);
                    const recipientTotal = categoryTotals.get(category!) || new Map<string, number>();
                    const total = recipientTotal.get(recipient) || 0;
                    recipientTotal.set(recipient, total + value);
                    categoryTotals.set(category!, recipientTotal);
                });
            })
            const rowData: { rowTitle: string, values: number[] }[] = []
            categoryTotals.forEach((recipientTotals, category) => {
                const r = { rowTitle: category, values: [] as number[] };
                groupRecipients.forEach(recipient => r.values.push(recipientTotals.get(recipient)!));
                rowData.push(r);
            });

            createTable(infoBox, ['Category', ...groupRecipients], rowData)
                // add a hover behaviour to each row that displays another popup div with the donor details with that rows category
                .on('mouseover', function (this: any, _: any, d: any) {
                    d3.select(this).style('background-color', 'beige');
                    const category = d.rowTitle,
                        donorsWithCategory = ds.filter(d => donorCategory.get(d) === category),
                        rowData =
                            donorsWithCategory.map(d =>
                            ({
                                rowTitle: d, values: Array.from(groupRecipients)
                                    .map(r => donors.get(d)!.get(r) || 0)
                            })),
                        infoBoxBounds = infoBox.node()!.getBoundingClientRect();
                    detailsBox
                        .style('top', event.pageY + 'px')
                        .html(`<h1>${category}</h1>`);
                    createTable(detailsBox, ['Donor', ...groupRecipients], rowData);
                    const
                        detailsBoxWidth = detailsBox.node()!.getBoundingClientRect().width,
                        left = (infoBoxBounds.x + infoBoxBounds.width + detailsBoxWidth) <= window.innerWidth
                            ? infoBoxBounds.x + infoBoxBounds.width
                            : infoBoxBounds.x - detailsBoxWidth
                    detailsBox
                        .style('left', left + 'px')
                        .style('visibility', 'visible')
                })
                .on('mouseout', function (this: any) {
                    detailsBox.style('visibility', 'hidden')
                    d3.select(this).style('background-color', 'white');
                });
        }

        infoBox.style("visibility", "visible")
            .style("left", event.pageX + "px")
            .style("top", event.pageY + "px");
    }

    const links = dedupeLinks(unsortedlinks);

    const nodeMap: Map<string, Node> = new Map();

    function addNode(id: string, value: number, colour: string) {
        const node = nodeMap.get(id);
        if (node) {
            node.value += value;
        } else {
            const node = new Node(id, value, colour);
            nodeMap.set(id, node);
        }
    }
    links.forEach(l => {
        addNode(l.source, l.value, 'grey');
        addNode(l.target, l.value, getPartyColour(l.target));
    })
    const nodes = Array.from(nodeMap.values());

    // Create a SVG container for the graph
    const svg = d3.select('body').append('svg')
        .attr('width', window.innerWidth)
        .attr('height', window.innerHeight)
        .on('mouseover', unhover);
    const container = svg.append('g');
    // Define the zoom behavior
    const zoom = d3.zoom()
        //.scaleExtent([1, 10]) // Adjust scale extent as needed
        .on('zoom', event => container.attr('transform', event.transform));
 
    // Constructs and configures a Sankey generator.
    const sankey = d3Sankey.sankey()
        .nodeId(d => d.id)
        .nodeAlign(d3Sankey.sankeyLeft) // d3.sankeyLeft, etc.
        .nodeWidth(15)
        .nodePadding(10)
        .extent([[100, 100], [window.innerWidth - 100, window.innerHeight - 100]])
        ({nodes,links})

    // Creates the rects that represent the nodes.
    const rect = container.append("g")
        .attr("stroke", "#000")
        .selectAll()
        .data(nodes)
        .join("rect")
        .attr("x", d => d.x0)
        .attr("y", d => d.y0)
        .attr("height", d => d.y1 - d.y0)
        .attr("width", d => d.x1 - d.x0)
        .attr("fill", d => getPartyColour(d.id));

    // Adds a title on the nodes.
    rect.append("title")
        .text(d => `${d.id}\n$${d.value.toLocaleString()}`);

    // Creates the paths that represent the links.
    const link = svg.append("g")
        .attr("fill", "none")
        .attr("stroke-opacity", 0.5)
        .selectAll()
        .data(links)
        .join("g")
        .style("mix-blend-mode", "multiply");

  link.append("path")
      .attr("d", d3Sankey.sankeyLinkHorizontal())
      .attr("stroke", d => getPartyColour(d.target.id))
      .attr("stroke-width", d => Math.max(1, d.width));

//   link.append("title")
//       .text(d => `${d.source.id} → ${d.target.id}\n${format(d.value)} TWh`);

  // Adds labels on the nodes.
  svg.append("g")
    .selectAll()
    .data(nodes)
    .join("text")
      .attr("x", d => d.x0 < window.innerWidth / 2 ? d.x1 + 6 : d.x0 - 6)
      .attr("y", d => (d.y1 + d.y0) / 2)
      .attr("dy", "0.35em")
      .attr("text-anchor", d => d.x0 < window.innerWidth / 2 ? "start" : "end")
      .text(d => d.id);

}).catch((error) => {
    // Handle any errors that occur during the loading process
    console.error('Error loading CSV file:', error);
});

