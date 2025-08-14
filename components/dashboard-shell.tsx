"use client"

import { Header } from "@/components/header"
import { ConsumerList } from "@/components/consumer-list"
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useRef } from "react"
import { ConsumerData } from "@/lib/google-sheets"
type TableCell = string | { content: string; colSpan?: number; styles?: any };


interface DashboardShellProps {
  role: string
  agencies: string[]
  showAdminPanel: boolean
  openAdmin: () => void
  closeAdmin: () => void
}

export function DashboardShell({ role, agencies, showAdminPanel, openAdmin, closeAdmin }: DashboardShellProps) {
  const consumerListRef = useRef<{ getCurrentConsumers: () => ConsumerData[] }>(null)

  const downloadPDF = () => {
    if (!consumerListRef.current) return;
    
    const consumers = [...consumerListRef.current.getCurrentConsumers()];
    const doc = new jsPDF({ orientation: "landscape" });

    // Sort consumers by OSD (high to low) and then by agency
    consumers.sort((a, b) => {
      // First sort by agency (alphabetical)
      const agencyCompare = (a.agency || "").localeCompare(b.agency || "");
      if (agencyCompare !== 0) return agencyCompare;
      
      // Then sort by OSD (descending within same agency)
      const aOsd = Number.parseFloat(a.d2NetOS || "0");
      const bOsd = Number.parseFloat(b.d2NetOS || "0");
      return bOsd - aOsd; // Descending order
    });

    // Calculate summary data
    const agencyNames = [...new Set(consumers.map(c => c.agency))].filter((a): a is string => typeof a === "string" && !!a);
    const statuses = [...new Set(consumers.map(c => c.disconStatus))].filter(Boolean);
    const totalOSD = consumers.reduce((sum, c) => sum + Number.parseFloat(c.d2NetOS || "0"), 0);

    // Improved agency name display (multi-line)
    const formatAgencyNames = (agencies: string[]) => {
      const maxLineLength = 150;
      let result: string[] = [];
      let currentLine = "";
      
      agencies.forEach((agency, index) => {
        if (currentLine.length + agency.length + 2 > maxLineLength) {
          result.push(currentLine);
          currentLine = agency;
        } else {
          currentLine += (currentLine ? ", " : "") + agency;
        }
        
        if (index === agencies.length - 1) {
          result.push(currentLine);
        }
      });
      
      return result;
    };

    // Add Cover Page with Summary Graph
    //doc.addPage();
    doc.setFontSize(20);
    doc.setTextColor(40, 53, 147);
    doc.text("Disconnection List & Summary", doc.internal.pageSize.width / 2, 20, { align: "center" });
    
    // Multi-line agency names
    const agencyLines = formatAgencyNames(agencyNames);
    doc.setFontSize(10);
    doc.setTextColor(81, 81, 81);
    agencyLines.forEach((line, i) => {
      doc.text(`Agencies: ${i === 0 ? line : line}`, doc.internal.pageSize.width / 2, 30 + (i * 5), { align: "center" });
    });

    // Calculate status statistics with amounts
    const statusStats = consumers.reduce((acc, c) => {
      const status = c.disconStatus || "Unknown";
      const amount = Number.parseFloat(c.d2NetOS || "0");
      if (!acc[status]) {
        acc[status] = { count: 0, amount: 0 };
      }
      acc[status].count++;
      acc[status].amount += amount;
      return acc;
    }, {} as Record<string, { count: number; amount: number }>);

    // Draw improved bar chart (centered with amounts)
    const chartStatuses = Object.keys(statusStats);
    const maxCount = Math.max(...chartStatuses.map(s => statusStats[s].count));
    const chartWidth = 180;
    const chartHeight = 60;
    const chartX = (doc.internal.pageSize.width - chartWidth) / 2; // Centered
    const chartY = 60;
    const barWidth = chartWidth / chartStatuses.length;

    // Chart title
    doc.setFontSize(12);
    doc.text("Total Overview", doc.internal.pageSize.width / 2, chartY - 10, { align: "center" });

    chartStatuses.forEach((status, i) => {
      const stat = statusStats[status];
      const barHeight = (stat.count / maxCount) * chartHeight;
      const x = chartX + (i * barWidth);
      const y = chartY + (chartHeight - barHeight);
      
      // Bar
      doc.setFillColor(41, 128, 185);
      doc.rect(x, y, barWidth - 5, barHeight, 'F');
      
      // Labels
      doc.setFontSize(7);
      doc.text(status.substring(0, 15).toUpperCase(), x + (barWidth/2) - 5, chartY + chartHeight + 5, { align: "center" });
      doc.text(stat.count.toString(), x + (barWidth/2) - 2, y - 5, { align: "center" });
      
      // Amount label below count
      doc.text(
        `${Math.round(stat.amount).toLocaleString('en-IN', {maximumFractionDigits: 0})}`,
        x + (barWidth/2) - 5,
        chartY + chartHeight + 10,
        { 
          align: "center",
          maxWidth: barWidth
        }
      );
    });

    // Summary text with improved formatting
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(`Total Consumers: ${consumers.length}`, 30, 150);
    doc.text(`Total Outstanding: ${Math.round(totalOSD).toLocaleString('en-IN', {maximumFractionDigits: 0})}`, 30, 155);
    doc.setFont("helvetica", "bold");
    const formatDate = (date: Date) => {
      const day = String(date.getDate()).padStart(2, '0');   // dd
      const month = String(date.getMonth() + 1).padStart(2, '0'); // mm (months are 0-indexed)
      const year = date.getFullYear(); // yyyy
      return `${day}.${month}.${year}`; // dd.mm.yyyy
    };

    // 2. Use it in your text
    doc.text(
      `Generated on: ${formatDate(new Date())}`, 
      30, 
      160
    );
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    doc.text(`For error reporting contact: je.kushidaccc@gmail.com`, 30, 185);
    //doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 30, 160);

    // Add Data Page (full width)
    doc.addPage();
    doc.setFontSize(16);
    doc.setTextColor(40, 53, 147);
    doc.text(`Disconnection List`, 14, 14);
    doc.setFontSize(10);
    agencyLines.forEach((line, i) => {
      doc.text(line, 14, 20 + (i * 5));                                           
    });

    // Table data with serial numbers (full width)
    const tableColumn = [
      "#", "Con ID", "Name", "Address", "Phone", "Device", 
      "Class", "Due Date", "OSD ", "Agency", "Status"
    ];
    
    const tableRows = consumers.map((c, index) => [
      index + 1,
      c.consumerId || "-",
      c.name || "-",
      c.address ? c.address.substring(0, 25) + (c.address.length > 30 ? "..." : "") : "-",
      c.mobileNumber || "-",
      c.device || "-",
      c.baseClass || "-",
      c.osDuedateRange || "-",
      { 
        content: `${Math.round(Number(c.d2NetOS || "0")).toLocaleString('en-IN', {maximumFractionDigits: 0})}`,
        styles: { 
          fontStyle: "bold",
          halign: "right",
          font: "helvetica" // Monospace font for amounts
        } 
      },
      c.agency || "-",
      { 
        content: c.disconStatus || "-", 
        styles: { 
          fillColor: getStatusColorForPDF(c.disconStatus),
          textColor: [0, 0, 0],
          cellPadding: 2
        } 
      }
    ]);

    autoTable(doc, {
      startY: 25,
      head: [tableColumn],
      body: tableRows,
      styles: { 
        fontSize: 7,
        cellPadding: 1.5,
        overflow: "linebreak",
        font: "helvetica"
      },
      headStyles: { 
        fillColor: [41, 128, 185],
        textColor: 255,
        fontSize: 7,
        fontStyle: "bold"
      },
      columnStyles: {
        0: { cellWidth: 10, halign: "center" },  // Serial number
        1: { cellWidth: 18 }, // Consumer ID
        2: { cellWidth: 40 }, // Name
        3: { cellWidth: 60 }, // Address
        4: { cellWidth: 20 }, // Phone
        5: { cellWidth: 20 }, // Device
        6: { cellWidth: 10 }, // Class
        7: { cellWidth: 30 }, // Due Date
        8: { cellWidth: 20 }, // OSD
        9: { cellWidth: 25 }, // Agency
        10: { cellWidth: 20 } // Status
      },
      alternateRowStyles: { 
        fillColor: [245, 245, 245] 
      },
      margin: { left: 10, right: 10, top: 25 },
      tableWidth: "wrap",
      didDrawPage: function(data) {
        // Footer
        doc.setFontSize(8);
        doc.setTextColor(100);
        doc.text(
          `Page ${doc.getNumberOfPages()}`,
          data.settings.margin.left,
          doc.internal.pageSize.height - 10
        );
        doc.setFontSize(8);
        doc.setFont("helvetica", "italic");
        doc.text(
          "For error reporting contact: je.kushidaccc@gmail.com",
          doc.internal.pageSize.width - 10, // 10mm from right edge
          doc.internal.pageSize.height - 10, // 10mm from bottom
          { align: "right" }
        );
      }
    });

    // Add Performance Ranking Page
    doc.addPage();
    doc.setFontSize(16);
    doc.setTextColor(40, 53, 147);
    doc.text("Agency Performance Ranking", doc.internal.pageSize.width / 2, 20, { align: "center" });

    // Calculate performance data
    const performanceData = calculateAgencyPerformance(consumers);

    // Convert to array and sort by total OSD (descending)
    const rankedAgencies = Object.entries(performanceData)
      .map(([agency, data]) => ({
        agency,
        ...data
      }))
      .sort((a, b) => b.totalOSD - a.totalOSD);

    // Get all relevant statuses (excluding connected/not found)
    const performanceStatuses = [...new Set(
      rankedAgencies.flatMap(a => Object.keys(a.statusCounts))
    )].filter(s => !["connected", "not found"].includes(s.toLowerCase()));

    // Prepare performance table data
    const performanceRows = [
      // Header row
      [
        "RANK",
        "AGENCY",
        "TOTAL OSD",
        "TOTAL ATTENDED",
        ...performanceStatuses.map(s => s.toUpperCase())
      ],
      // Data rows
      ...rankedAgencies.map((agency, index) => [
        index + 1,
        agency.agency,
        `${Math.round(agency.totalOSD).toLocaleString('en-IN', {maximumFractionDigits: 0})}`,
        agency.totalConsumers,
        ...performanceStatuses.map(status => 
          agency.statusCounts[status] || "0"
        )
      ])
    ];

    // Generate performance table
    autoTable(doc, {
      startY: 30,
      head: [performanceRows[0]],
      body: performanceRows.slice(1),
      styles: {
        fontSize: 8,
        cellPadding: 2,
        font: "helvetica"
      },
      headStyles: {
        fillColor: [41, 128, 185],
        textColor: 255,
        fontSize: 7,
        fontStyle: "bold"
      },
      columnStyles: {
        0: { cellWidth: 15, halign: "center" }, // Rank
        1: { cellWidth: 40 }, // Agency
        2: { cellWidth: 35, halign: "center" }, // Total OSD
        3: { cellWidth: 30, halign: "center" }, // Total Attended
        // Status columns
        ...Object.fromEntries(
          performanceStatuses.map((_, i) => [
            i + 4, // Starting from column index 4
            { cellWidth: 30, halign: "center" }
          ])
        )
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245]
      },
      margin: { left: 10, right: 10 },
      didDrawPage: function(data) {
        // Footer
        doc.setFontSize(8);
        doc.setTextColor(100);
        doc.text(
          `Page ${doc.getNumberOfPages()}`,
          data.settings.margin.left,
          doc.internal.pageSize.height - 10
        );
      }
    });


    // Improved Summary Statistics Page
    doc.addPage();
    doc.setFontSize(16);
    doc.setTextColor(40, 53, 147);
    doc.text("Summary Statistics", doc.internal.pageSize.width / 2, 20, { align: "center" });

    // Create cross-tab data (Agencies x Statuses)
    const crossTabData: Record<string, Record<string, { count: number; amount: number }>> = {};
    
    // Initialize structure
    agencyNames.forEach(agency => {
      crossTabData[agency] = {};
      statuses.forEach(status => {
        crossTabData[agency][status] = { count: 0, amount: 0 };
      });
    });

    // Populate data
    consumers.forEach(c => {
      const agency = c.agency || "Unknown";
      const status = c.disconStatus || "Unknown";
      const amount = Number.parseFloat(c.d2NetOS || "0");
      
      if (!crossTabData[agency]) {
        crossTabData[agency] = {};
      }
      if (!crossTabData[agency][status]) {
        crossTabData[agency][status] = { count: 0, amount: 0 };
      }
      
      crossTabData[agency][status].count++;
      crossTabData[agency][status].amount += amount;
    });

    // Prepare summary table data
    // Prepare summary table data
    const summaryRows: any[] = [];

    // Header row - modified for better readability
    // Prepare header rows as plain strings (no merged cells)
    const headerRow: TableCell[] = ["Agency"];
    
    // Add status headers as "Status Count" and "Status Amount"
    statuses.forEach(status => {
      headerRow.push({
        content: status.toUpperCase(),
        colSpan: 2,
        styles: {
          halign: 'center',
          fillColor: [41, 128, 185],
          textColor: 255,
          fontStyle: 'bold'
        }
      });
    });


    // Add Total headers
    headerRow.push("Total Count", "Total Amount");

    // Add sub-header row with just Count/Amount labels
    const subHeaderRow = [""]; // Empty agency cell
    statuses.forEach(() => {
      subHeaderRow.push(
        "Count",
        "Amount"
      );
    });

    // Add Total sub-headers
    subHeaderRow.push(
      "Count",
      "Amount"
    );

    // Add to summary rows
    summaryRows.push(headerRow);
    summaryRows.push(subHeaderRow);

    // Data rows - fixed to always show amounts
    agencyNames.forEach(agency => {
      const row = [agency]; // Agency name
      let agencyTotalCount = 0;
      let agencyTotalAmount = 0;
      
      statuses.forEach(status => {
        const stat = crossTabData[agency][status] || { count: 0, amount: 0 };
        row.push(stat.count.toString()); // Always show count (0 instead of -)
        row.push(`${Math.round(stat.amount).toLocaleString('en-IN', {maximumFractionDigits: 0})}`);
        agencyTotalCount += stat.count;
        agencyTotalAmount += stat.amount;
      });
      
      // Agency totals
      row.push(agencyTotalCount.toString());
      row.push(`${Math.round(agencyTotalAmount).toLocaleString('en-IN', {maximumFractionDigits: 0})}`);
      summaryRows.push(row);
    });

    // Footer row with grand totals - fixed to show amounts
    const footerRow = ["Grand Total"];
    let grandTotalCount = 0;
    let grandTotalAmount = 0;

    statuses.forEach(status => {
      const statusTotalCount = agencyNames.reduce((sum, agency) => 
        sum + ((crossTabData[agency][status]?.count) || 0), 0);
      const statusTotalAmount = agencyNames.reduce((sum, agency) => 
        sum + ((crossTabData[agency][status]?.amount) || 0), 0);
      
      footerRow.push(statusTotalCount.toString());
      footerRow.push(`${Math.round(statusTotalAmount).toLocaleString('en-IN', {maximumFractionDigits: 0})}`);
      grandTotalCount += statusTotalCount;
      grandTotalAmount += statusTotalAmount;
    });

    footerRow.push(grandTotalCount.toString());
    footerRow.push(`${Math.round(grandTotalAmount).toLocaleString('en-IN', {maximumFractionDigits: 0})}`);
    summaryRows.push(footerRow);

    // Generate the summary table with improved styling
    autoTable(doc, {
      startY: 30,
      head: [summaryRows[0]], // Main header
      body: [
        summaryRows[1], // Sub-header
        ...summaryRows.slice(2, -1) // Data rows
      ],
      foot: [summaryRows[summaryRows.length - 1]], // Footer
      styles: { 
        fontSize: 7, // Increased from 7
        cellPadding: 3, // More padding
        font: "helvetica", // Cleaner font
        lineWidth: 0.1, // Thinner borders
        lineColor: [200, 200, 200] // Light gray borders
      },
      headStyles: { 
        fillColor: [41, 128, 185],
        textColor: 255,
        fontSize: 7, // Larger header font
        fontStyle: "bold",
        cellPadding: 4
      },
      bodyStyles: {
        fontSize: 7,
        cellPadding: 2
      },
      footStyles: {
        fillColor: [41, 128, 185],
        textColor: 255,
        fontSize: 7,
        fontStyle: "bold",
        cellPadding: 4
      },
      columnStyles: {
        0: { // Agency column
          cellWidth: 30, // Wider
          fontStyle: "bold",
          halign: "left"
        },
        // Right-align all amount columns
        ...Object.fromEntries(
          Array.from({ length: statuses.length * 2 + 2 }, (_, i) => 
            [i * 2 + 1, { halign: "right" }] // Every odd column is amount
          )
        )
      },
      margin: { left: 10, right: 10 },
      tableWidth: "auto", // Better width calculation
      theme: "grid", // Clean grid style
      // didParseCell: function(data) {
      //   // Highlight non-zero amounts
      //   if (data.column.index > 0 && data.row.index > 1) {
      //     const numValue = Number(data.cell.text[0]?.toString().replace(/[^0-9]/g, ''));
      //     if (!isNaN(numValue) && numValue > 0) {
      //       data.cell.styles.fillColor = [245, 245, 245]; // Light gray
      //     }
      //   }
      // }
    });

    doc.save(`Disconnection_Report_${new Date().toISOString().slice(0,10)}.pdf`);
  };
  const calculateAgencyPerformance = (consumers: ConsumerData[]) => {
    const excludedStatuses = ["connected", "not found"];
    
    return consumers.reduce((acc, consumer) => {
      const status = (consumer.disconStatus || "").toLowerCase();
      if (excludedStatuses.includes(status)) return acc;
      
      const agency = consumer.agency || "Unknown";
      const amount = Number.parseFloat(consumer.d2NetOS || "0");
      
      if (!acc[agency]) {
        acc[agency] = {
          totalOSD: 0,
          statusCounts: {},
          totalConsumers: 0
        };
      }
      
      acc[agency].totalOSD += amount;
      acc[agency].totalConsumers++;
      
      if (!acc[agency].statusCounts[status]) {
        acc[agency].statusCounts[status] = 0;
      }
      acc[agency].statusCounts[status]++;
      
      return acc;
    }, {} as Record<string, {
      totalOSD: number;
      statusCounts: Record<string, number>;
      totalConsumers: number;
    }>);
  };
  // Helper function for status colors in PDF
  const getStatusColorForPDF = (status: string) => {
    if (!status) return [200, 200, 200];
    switch (status.toLowerCase()) {
      case "connected": return [200, 230, 200];
      case "disconnected": return [255, 200, 200];
      case "pending": return [255, 255, 200];
      case "deemed disconnection": return [255, 220, 200];
      case "temprory disconnected": return [220, 200, 255];
      default: return [200, 200, 200];
    }
  };

  // const downloadPDF = () => {
  //   if (!consumerListRef.current) return
    
  //   const consumers = consumerListRef.current.getCurrentConsumers()
  //   const doc = new jsPDF({ orientation: "landscape" })
  //   doc.setFontSize(16)
  //   doc.text("Consumer List", 14, 14)

  //   const tableColumn = [
  //     "Con id", "Name", "Address", "Ph", "Device", "Class",
  //     "Due Date Range", "Net OSD", "Agency", "Status"
  //   ]
  //   const tableRows = consumers.map(c => [
  //     c.consumerId || "",
  //     c.name || "",
  //     c.address || "",
  //     c.mobileNumber || "",
  //     c.device || "",
  //     c.baseClass || "",
  //     c.osDuedateRange || "",
  //     c.d2NetOS || "",
  //     c.agency || "",
  //     c.disconStatus || ""
  //   ])

  //   autoTable(doc, {
  //     startY: 20,
  //     head: [tableColumn],
  //     body: tableRows,
  //     styles: { fontSize: 7 },
  //     headStyles: { fillColor: [41, 128, 185], textColor: 255 },
  //     alternateRowStyles: { fillColor: [240, 240, 240] }
  //   })

  //   doc.save(`Consumer_List_${new Date().toISOString().slice(0,10)}.pdf`)
  // }
  return (
    <>
      <Header userRole={role} onAdminClick={role === "admin" ? openAdmin : undefined} onDownload={role === "admin" ? downloadPDF : downloadPDF} />

      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <div className="mb-4">
          <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-600">
            {role === "admin" ? "Manage all consumers across agencies" : `Manage consumers for: ${agencies.join(", ")}`}
          </p>
        </div>

        <ConsumerList
          ref={consumerListRef}
          userRole={role}
          userAgencies={agencies}
          onAdminClick={openAdmin}
          showAdminPanel={showAdminPanel}
          onCloseAdminPanel={closeAdmin}
          onDownload={downloadPDF}
        />
      </main>
    </>
  )
}
