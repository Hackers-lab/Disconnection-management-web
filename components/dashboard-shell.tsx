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
    const downloadTopDefaulters = () => {
      if (!consumerListRef.current) return;

      const consumers = [...consumerListRef.current.getCurrentConsumers()];
      if (consumers.length === 0) {
        alert("No consumer data available.");
        return;
      }

      const input = prompt("Enter number of top defaulters to download:");
      const topN = parseInt(input || "0", 10);
      if (!topN || topN <= 0) {
        alert("Invalid number entered.");
        return;
      }

      // Sort by OSD high → low
      const sorted = consumers.sort((a, b) => 
        Number(b.d2NetOS || 0) - Number(a.d2NetOS || 0)
      );

      const topConsumers = sorted.slice(0, topN);

      // Generate PDF
      const doc = new jsPDF({ orientation: "landscape" });
      doc.setFontSize(16);
      doc.setTextColor(40, 53, 147);
      doc.text(`Top ${topN} Defaulters`, doc.internal.pageSize.width / 2, 15, { align: "center" });

      const tableColumn = ["#", "Con ID", "Name", "Address", "Phone", "Device", "Class", "Due Date", "OSD", "Status"];
      const tableRows = topConsumers.map((c, index) => [
        index + 1,
        c.consumerId || "-",
        c.name || "-",
        c.address ? c.address.substring(0, 35) + (c.address.length > 35 ? "..." : "") : "-",
        {
          content: c.mobileNumber || "-",
          styles: { textColor: [0, 0, 255] },
          link: c.mobileNumber ? `tel:${c.mobileNumber}` : undefined
        },
        c.device || "-",
        c.baseClass || "-",
        c.osDuedateRange || "-",
        {
          content: `${Math.round(Number(c.d2NetOS || "0")).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`,
          styles: { fontStyle: "bold", halign: "right" }
        },
        { 
          content: c.disconStatus || "-", 
          styles: { fillColor: getStatusColorForPDF(c.disconStatus), textColor: [0, 0, 0] } 
        }
      ]);

      autoTable(doc, {
        startY: 25,
        head: [tableColumn],
        body: tableRows as any,
        styles: { fontSize: 7, font: "helvetica" },
        didDrawPage: function(data) {
          doc.setFontSize(8);
          doc.setTextColor(100);
          doc.text(
            `Page ${doc.getNumberOfPages()}`,
            data.settings.margin.left,
            doc.internal.pageSize.height - 10
          );
        }
      });

      doc.save(`Top_${topN}_Defaulters_${new Date().toISOString().slice(0,10)}.pdf`);
    };

  const downloadPDF = () => {
    if (!consumerListRef.current) return;
    
    const consumers = [...consumerListRef.current.getCurrentConsumers()];
    const doc = new jsPDF({ orientation: "landscape" });
    const isAdmin = role === "admin";
    let heading = "Disconnection Summary Dashboard";
    const officeCode = consumers.length > 0 ? consumers[0].offCode : "";
    if (officeCode === "6612107") {
      heading = "Kushida";
    } else if (officeCode === "6612104") {
      heading = "Chanchal";
    }

    // Track sections for Contents page
    const sections: { title: string; page: number }[] = [];

    // Sort consumers by OSD (high to low) and then by agency
    consumers.sort((a, b) => {
      const agencyCompare = (a.agency || "").localeCompare(b.agency || "");
      if (agencyCompare !== 0) return agencyCompare;
      const aOsd = Number.parseFloat(a.d2NetOS || "0");
      const bOsd = Number.parseFloat(b.d2NetOS || "0");
      return bOsd - aOsd;
    });

    const agencyNames = [...new Set(consumers.map(c => c.agency))].filter((a): a is string => typeof a === "string" && !!a);
    const statuses = [...new Set(consumers.map(c => c.disconStatus))].filter(Boolean);
    const totalOSD = consumers.reduce((sum, c) => sum + Number.parseFloat(c.d2NetOS || "0"), 0);

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

    // ---- SUMMARY DASHBOARD (Admin only) ----
    if (isAdmin) {
      sections.push({ title: "Summary Dashboard", page: doc.getNumberOfPages() });  


      //doc.addPage();
      doc.setFontSize(20);
      doc.setTextColor(40, 53, 147);

      doc.text(`Disconnection Report For ${heading} CCC`, doc.internal.pageSize.width / 2, 20, { align: "center" });

      const agencyLines = formatAgencyNames(agencyNames);
      doc.setFontSize(10);
      doc.setTextColor(81, 81, 81);
      agencyLines.forEach((line, i) => {
        doc.text(`Agencies: ${line}`, doc.internal.pageSize.width / 2, 30 + (i * 5), { align: "center" });
      });

      // Status statistics
      const statusStats = consumers.reduce((acc, c) => {
        const status = c.disconStatus || "Unknown";
        const amount = Number.parseFloat(c.d2NetOS || "0");
        if (!acc[status]) acc[status] = { count: 0, amount: 0 };
        acc[status].count++;
        acc[status].amount += amount;
        return acc;
      }, {} as Record<string, { count: number; amount: number }>);

      const chartStatuses = Object.keys(statusStats);
      const maxCount = Math.max(...chartStatuses.map(s => statusStats[s].count));
      const chartWidth = 180;
      const chartHeight = 60;
      const chartX = (doc.internal.pageSize.width - chartWidth) / 2;
      const chartY = 60;
      const barWidth = chartWidth / chartStatuses.length;

      // Chart title
      doc.setFontSize(12);
      doc.text("Status Overview", doc.internal.pageSize.width / 2, chartY - 10, { align: "center" });

      const colorPalette = [                                                          
        [65, 105, 225], [220, 20, 60], [255, 140, 0], [46, 139, 87],
        [138, 43, 226], [255, 215, 0], [34, 139, 34], [218, 165, 32]
      ];

      chartStatuses.forEach((status, i) => {
        const stat = statusStats[status];
        const barHeight = (stat.count / maxCount) * chartHeight;
        const x = chartX + (i * barWidth);
        const y = chartY + (chartHeight - barHeight);
        const color = colorPalette[i % colorPalette.length];

        // Bar
        doc.setFillColor(color[0], color[1], color[2]);
        doc.rect(x, y, barWidth - 5, barHeight, 'F');
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.2);
        doc.rect(x, y, barWidth - 5, barHeight, 'S');

        // Status label
        doc.setFontSize(7);
        doc.text(status.substring(0, 12).toUpperCase(), x + (barWidth/2) - 5, chartY + chartHeight + 5, { 
          align: "center",
          maxWidth: barWidth - 5
        });

        // Count + % label
        const percentage = ((stat.count / consumers.length) * 100).toFixed(1);
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.text(`${stat.count} (${percentage}%)`, x + (barWidth/2) - 2, y - 5, { align: "center" });

        // Amount label
        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.text(
          `${Math.round(stat.amount).toLocaleString('en-IN', {maximumFractionDigits: 0})}`,
          x + (barWidth/2) - 5,
          chartY + chartHeight + 10,
          { align: "center", maxWidth: barWidth - 5 }
        );
      });

      // Summary text
      doc.setFontSize(12);
      doc.setFont("helvetica", "italic");
      doc.text(`Total Consumers: ${consumers.length.toLocaleString('en-IN')}`, 30, 150);
      doc.text(`Total Outstanding: ${Math.round(totalOSD).toLocaleString('en-IN', {maximumFractionDigits: 0})}`, 30, 155);
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
      doc.setTextColor(150);
      doc.setFont("helvetica", "italic");
      doc.text(`For error reporting contact: je.kushidaccc@gmail.com`, 30, 165);


    }

    // ---- AGENCY CONSUMER LISTS ----
    const consumersByAgency: Record<string, ConsumerData[]> = {};
    consumers.forEach(c => {
      const agency = c.agency || "Unknown";
      if (!consumersByAgency[agency]) consumersByAgency[agency] = [];
      consumersByAgency[agency].push(c);
    });

    Object.entries(consumersByAgency).forEach(([agency, agencyConsumers]) => {
      sections.push({ title: `Disconnection List - ${agency}`, page: doc.getNumberOfPages() + 1 });
      if(isAdmin){ doc.addPage(); }
      doc.setFontSize(16);
      doc.setTextColor(40, 53, 147);
      doc.text(`${agency} - Disconnection List`, 14, 14);
      doc.setFontSize(10);
      doc.text(`Total Consumers: ${agencyConsumers.length}`, 14, 20);

      const tableColumn = ["#", "Con ID", "Name", "Address", "Phone", "Device", "Class", "Due Date", "OSD", "Status"];
      const tableRows = agencyConsumers.map((c, index) => [
        index + 1,
        c.consumerId || "-",
        c.name || "-",
        c.address ? c.address.substring(0, 35) + (c.address.length > 35 ? "..." : "") : "-",
        {
          content: c.mobileNumber || "-",
          styles: { textColor: [0, 0, 255] },   // blue like a hyperlink
          link: c.mobileNumber ? `tel:${c.mobileNumber}` : undefined
        },
        c.device || "-",
        c.baseClass || "-",
        c.osDuedateRange || "-",
        { content: `${Math.round(Number(c.d2NetOS || "0")).toLocaleString('en-IN', {maximumFractionDigits: 0})}`, styles: { fontStyle: "bold", halign: "right" } },
        { content: c.disconStatus || "-", styles: { fillColor: getStatusColorForPDF(c.disconStatus), textColor: [0,0,0] } }
      ]);

      autoTable(doc, { startY: 25, head: [tableColumn], body: tableRows as any, styles: { fontSize: 7, font: "helvetica" },
      didDrawPage: function(data) {
        // Footer
        doc.setFontSize(8);
        doc.setTextColor(100);
        if(isAdmin){
          doc.text(
            `Page ${doc.getNumberOfPages()+1}`,
            data.settings.margin.left,
            doc.internal.pageSize.height - 10
          );
        } else {
          doc.text(
            `Page ${doc.getNumberOfPages()}`,
            data.settings.margin.left,
            doc.internal.pageSize.height - 10
          );
        }
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
    });

    // ---- PERFORMANCE PAGE (Admin only) ----
    if (isAdmin) {
      sections.push({ title: "Agency Performance Ranking", page: doc.getNumberOfPages() + 1 });
      doc.addPage();
      doc.setFontSize(16);
      doc.text("Agency Performance Ranking", doc.internal.pageSize.width / 2, 20, { align: "center" });
      // (Performance table code remains, omitted for brevity)
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
            `Page ${doc.getNumberOfPages() + 1}`,
            data.settings.margin.left,
            doc.internal.pageSize.height - 10
          );
        }
      });
    }

    // ---- SUMMARY STATISTICS (Admin only) ----
    if (isAdmin) {
      sections.push({ title: "Summary Statistics", page: doc.getNumberOfPages() + 1 });
      doc.addPage();
      doc.setFontSize(16);
      doc.text("Summary Statistics", doc.internal.pageSize.width / 2, 20, { align: "center" });
      // (Summary table code remains, omitted for brevity)
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
      }

    // ---- INSERT CONTENTS PAGE FIRST ----
    if (isAdmin) {
      doc.insertPage(1);
      doc.setFontSize(20);
      doc.setTextColor(40, 53, 147);
      doc.text(`Disconnection Report for ${heading} CCC`, doc.internal.pageSize.width / 2, 15, { align: "center" });
      doc.setFontSize(20);
      doc.setTextColor(255, 0, 0);
      doc.text(`Table of Contents`, doc.internal.pageSize.width / 2, 25, { align: "center" });

      doc.setFontSize(12);
      doc.setFont("helvetica", "italic");
      let y = 40;
      sections.forEach(s => {
        doc.setTextColor(0, 0, 255);
        doc.textWithLink(`${s.title} ..........Page - ${s.page+1}`, 20, y, { pageNumber: s.page+1 });
        y += 7;
      });
    }

    doc.save(`Disconnection_Report_${new Date().toISOString().slice(0,10)}.pdf`);
  };

  const calculateAgencyPerformance = (consumers: ConsumerData[]) => {
    const excludedStatuses = ["connected", "not found"];
    return consumers.reduce((acc, c) => {
      const status = (c.disconStatus || "").toLowerCase();
      if (excludedStatuses.includes(status)) return acc;
      const agency = c.agency || "Unknown";
      const amount = Number.parseFloat(c.d2NetOS || "0");
      if (!acc[agency]) acc[agency] = { totalOSD: 0, statusCounts: {}, totalConsumers: 0 };
      acc[agency].totalOSD += amount;
      acc[agency].totalConsumers++;
      acc[agency].statusCounts[status] = (acc[agency].statusCounts[status] || 0) + 1;
      return acc;
    }, {} as Record<string, { totalOSD: number; statusCounts: Record<string, number>; totalConsumers: number }>);
  };

  const getStatusColorForPDF = (status: string) => {
    if (!status) return [200,200,200];
    switch (status.toLowerCase()) {
      case "connected": return [200, 230, 200];
      case "disconnected": return [255, 200, 200];
      case "pending": return [255, 255, 200];
      case "deemed disconnection": return [255, 220, 200];
      case "temprory disconnected": return [220, 200, 255];
      default: return [200, 200, 200];
    }
  };

  return (
    <>
      <Header userRole={role} onAdminClick={role === "admin" ? openAdmin : undefined} onDownload={downloadPDF} onDownloadDefaulters={downloadTopDefaulters} />
      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <div className="mb-4">
          <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-600">
            {role === "admin" ? "Manage all consumers across agencies" : `Manage consumers for: ${agencies.join(", ")}`}
          </p>
        </div>
        <ConsumerList ref={consumerListRef} userRole={role} userAgencies={agencies} onAdminClick={openAdmin} showAdminPanel={showAdminPanel} onCloseAdminPanel={closeAdmin} onDownload={downloadPDF} onDownloadDefaulters={downloadTopDefaulters} />
      </main>
    </>
  )
}
