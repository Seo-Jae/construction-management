const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.77';
const projectRoot = process.cwd();
const targetPath = path.join(
  projectRoot,
  'src',
  'page',
  'MaterialInputStatus.jsx',
);
const replacements = [{"label": "엑셀 문서 서식 공통 함수 추가", "oldText": "const parseHeadOfficeWorkbook =\n  async ({", "newText": "const getExcelColumnLetter = (\n  columnNumber,\n) => {\n  let value =\n    Math.max(\n      1,\n      Number(columnNumber) || 1,\n    );\n\n  let result = '';\n\n  while (value > 0) {\n    const remainder =\n      (value - 1) % 26;\n\n    result =\n      String.fromCharCode(\n        65 + remainder,\n      ) + result;\n\n    value =\n      Math.floor(\n        (value - 1) / 26,\n      );\n  }\n\n  return result;\n};\n\nconst formatMaterialExportWorksheet = ({\n  worksheet,\n  title,\n  projectName,\n  periodLabel,\n  moneyColumns = [],\n  quantityColumns = [],\n  integerColumns = [],\n  centerColumns = [],\n  totalRowNumber = null,\n}) => {\n  if (!worksheet) {\n    return;\n  }\n\n  const originalColumnCount =\n    Math.max(\n      worksheet.columnCount,\n      1,\n    );\n\n  /*\n    기존 1행 제목을 5행으로 내리고\n    상단에 문서 제목·현장·조회조건을 배치합니다.\n  */\n  worksheet.spliceRows(\n    1,\n    0,\n    [],\n    [],\n    [],\n    [],\n  );\n\n  const headerRowNumber = 5;\n\n  const lastColumnLetter =\n    getExcelColumnLetter(\n      originalColumnCount,\n    );\n\n  const generatedAt =\n    new Date().toLocaleString(\n      'ko-KR',\n      {\n        timeZone:\n          'Asia/Seoul',\n      },\n    );\n\n  worksheet.mergeCells(\n    `A1:${lastColumnLetter}1`,\n  );\n\n  worksheet.mergeCells(\n    `A2:${lastColumnLetter}2`,\n  );\n\n  worksheet.mergeCells(\n    `A3:${lastColumnLetter}3`,\n  );\n\n  const titleCell =\n    worksheet.getCell('A1');\n\n  titleCell.value =\n    title;\n\n  titleCell.font = {\n    name: '맑은 고딕',\n    size: 16,\n    bold: true,\n    color: {\n      argb: 'FF0F172A',\n    },\n  };\n\n  titleCell.alignment = {\n    horizontal: 'center',\n    vertical: 'middle',\n  };\n\n  worksheet.getRow(1).height =\n    28;\n\n  const projectCell =\n    worksheet.getCell('A2');\n\n  projectCell.value =\n    `현장명 : ${projectName || '-'}`;\n\n  projectCell.font = {\n    name: '맑은 고딕',\n    size: 10,\n    bold: true,\n    color: {\n      argb: 'FF334155',\n    },\n  };\n\n  projectCell.alignment = {\n    horizontal: 'left',\n    vertical: 'middle',\n  };\n\n  worksheet.getRow(2).height =\n    20;\n\n  const infoCell =\n    worksheet.getCell('A3');\n\n  infoCell.value =\n    `조회기간 : ${periodLabel || '-'}    /    출력일시 : ${generatedAt}`;\n\n  infoCell.font = {\n    name: '맑은 고딕',\n    size: 9,\n    color: {\n      argb: 'FF64748B',\n    },\n  };\n\n  infoCell.alignment = {\n    horizontal: 'left',\n    vertical: 'middle',\n  };\n\n  worksheet.getRow(3).height =\n    19;\n\n  worksheet.getRow(4).height =\n    7;\n\n  const headerRow =\n    worksheet.getRow(\n      headerRowNumber,\n    );\n\n  headerRow.height =\n    26;\n\n  headerRow.eachCell(\n    {\n      includeEmpty: true,\n    },\n    (cell) => {\n      cell.fill = {\n        type: 'pattern',\n        pattern: 'solid',\n        fgColor: {\n          argb: 'FF1E3A5F',\n        },\n      };\n\n      cell.font = {\n        name: '맑은 고딕',\n        size: 9,\n        bold: true,\n        color: {\n          argb: 'FFFFFFFF',\n        },\n      };\n\n      cell.alignment = {\n        horizontal: 'center',\n        vertical: 'middle',\n        wrapText: true,\n      };\n\n      cell.border = {\n        top: {\n          style: 'thin',\n          color: {\n            argb: 'FF94A3B8',\n          },\n        },\n        left: {\n          style: 'thin',\n          color: {\n            argb: 'FF94A3B8',\n          },\n        },\n        bottom: {\n          style: 'thin',\n          color: {\n            argb: 'FF64748B',\n          },\n        },\n        right: {\n          style: 'thin',\n          color: {\n            argb: 'FF94A3B8',\n          },\n        },\n      };\n    },\n  );\n\n  const adjustedTotalRowNumber =\n    totalRowNumber\n      ? totalRowNumber + 4\n      : null;\n\n  for (\n    let rowNumber =\n      headerRowNumber + 1;\n    rowNumber <=\n      worksheet.rowCount;\n    rowNumber += 1\n  ) {\n    const row =\n      worksheet.getRow(\n        rowNumber,\n      );\n\n    row.height =\n      Math.max(\n        Number(row.height) || 0,\n        20,\n      );\n\n    row.eachCell(\n      {\n        includeEmpty: true,\n      },\n      (cell) => {\n        cell.font = {\n          ...cell.font,\n          name: '맑은 고딕',\n          size: 9,\n        };\n\n        cell.alignment = {\n          ...cell.alignment,\n          vertical: 'middle',\n          wrapText: true,\n        };\n\n        cell.border = {\n          top: {\n            style: 'thin',\n            color: {\n              argb: 'FFE2E8F0',\n            },\n          },\n          left: {\n            style: 'thin',\n            color: {\n              argb: 'FFE2E8F0',\n            },\n          },\n          bottom: {\n            style: 'thin',\n            color: {\n              argb: 'FFE2E8F0',\n            },\n          },\n          right: {\n            style: 'thin',\n            color: {\n              argb: 'FFE2E8F0',\n            },\n          },\n        };\n      },\n    );\n\n    if (\n      adjustedTotalRowNumber &&\n      rowNumber ===\n        adjustedTotalRowNumber\n    ) {\n      row.eachCell(\n        {\n          includeEmpty: true,\n        },\n        (cell) => {\n          cell.fill = {\n            type: 'pattern',\n            pattern: 'solid',\n            fgColor: {\n              argb: 'FFEFF6FF',\n            },\n          };\n\n          cell.font = {\n            ...cell.font,\n            bold: true,\n            color: {\n              argb: 'FF1E3A8A',\n            },\n          };\n\n          cell.border = {\n            ...cell.border,\n            top: {\n              style: 'medium',\n              color: {\n                argb: 'FF60A5FA',\n              },\n            },\n          };\n        },\n      );\n    }\n  }\n\n  moneyColumns.forEach(\n    (columnNumber) => {\n      const column =\n        worksheet.getColumn(\n          columnNumber,\n        );\n\n      column.numFmt =\n        '#,##0;[Red]-#,##0;0';\n\n      column.alignment = {\n        horizontal: 'right',\n        vertical: 'middle',\n      };\n    },\n  );\n\n  quantityColumns.forEach(\n    (columnNumber) => {\n      const column =\n        worksheet.getColumn(\n          columnNumber,\n        );\n\n      column.numFmt =\n        '#,##0.####';\n\n      column.alignment = {\n        horizontal: 'right',\n        vertical: 'middle',\n      };\n    },\n  );\n\n  integerColumns.forEach(\n    (columnNumber) => {\n      const column =\n        worksheet.getColumn(\n          columnNumber,\n        );\n\n      column.numFmt =\n        '#,##0';\n\n      column.alignment = {\n        horizontal: 'right',\n        vertical: 'middle',\n      };\n    },\n  );\n\n  centerColumns.forEach(\n    (columnNumber) => {\n      worksheet.getColumn(\n        columnNumber,\n      ).alignment = {\n        horizontal: 'center',\n        vertical: 'middle',\n        wrapText: true,\n      };\n    },\n  );\n\n  worksheet.autoFilter = {\n    from: {\n      row: headerRowNumber,\n      column: 1,\n    },\n    to: {\n      row: headerRowNumber,\n      column:\n        originalColumnCount,\n    },\n  };\n\n  worksheet.views = [\n    {\n      state: 'frozen',\n      ySplit:\n        headerRowNumber,\n    },\n  ];\n\n  worksheet.pageSetup.orientation =\n    'landscape';\n\n  worksheet.pageSetup.paperSize =\n    9;\n\n  worksheet.pageSetup.fitToPage =\n    true;\n\n  worksheet.pageSetup.fitToWidth =\n    1;\n\n  worksheet.pageSetup.fitToHeight =\n    0;\n\n  worksheet.pageSetup.horizontalCentered =\n    true;\n\n  worksheet.pageSetup.margins = {\n    left: 0.25,\n    right: 0.25,\n    top: 0.5,\n    bottom: 0.5,\n    header: 0.2,\n    footer: 0.2,\n  };\n\n  worksheet.pageSetup.printTitlesRow =\n    '1:5';\n\n  worksheet.pageSetup.printArea =\n    `A1:${lastColumnLetter}${worksheet.rowCount}`;\n\n  worksheet.headerFooter.oddFooter =\n    `&L${projectName || ''}&C자재투입현황&R&P / &N`;\n};\n\nconst parseHeadOfficeWorkbook =\n  async ({"}, {"label": "업체별 다운로드의 월 원본 상세 서식 적용", "oldText": "        detailWorksheet.views = [\n          {\n            state: 'frozen',\n            ySplit: 1,\n          },\n        ];\n\n        downloadSuffix =\n          `업체별월누계_${supplierPeriodStart}_${supplierPeriodEnd}`;", "newText": "        formatMaterialExportWorksheet({\n          worksheet:\n            detailWorksheet,\n          title:\n            '자재투입현황 - 월 원본 상세',\n          projectName,\n          periodLabel:\n            supplierPeriodLabel,\n          moneyColumns: [\n            12,\n            13,\n            14,\n            15,\n            16,\n          ],\n          quantityColumns: [\n            11,\n          ],\n          integerColumns: [\n            1,\n          ],\n          centerColumns: [\n            2,\n            3,\n            4,\n            5,\n            6,\n            10,\n          ],\n          totalRowNumber:\n            detailTotalRow.number,\n        });\n\n        downloadSuffix =\n          `업체별월누계_${supplierPeriodStart}_${supplierPeriodEnd}`;"}, {"label": "다운로드 메인 시트 문서서식 적용", "oldText": "      worksheet.getRow(\n        1,\n      ).font = {\n        bold: true,\n      };\n\n      worksheet.views = [\n        {\n          state: 'frozen',\n          ySplit: 1,\n        },\n      ];\n\n      const buffer =", "newText": "      formatMaterialExportWorksheet({\n        worksheet,\n        title:\n          tabValue === 1\n            ? '자재투입현황 - 업체별 월·누계'\n            : '자재투입현황 - 품목별 월·누계',\n        projectName,\n        periodLabel:\n          tabValue === 1\n            ? supplierPeriodLabel\n            : selectedPeriodLabel,\n        moneyColumns:\n          tabValue === 1\n            ? [\n                3,\n                4,\n                5,\n                6,\n                7,\n                8,\n              ]\n            : [\n                6,\n                8,\n              ],\n        quantityColumns:\n          tabValue === 1\n            ? []\n            : [\n                5,\n                7,\n              ],\n        integerColumns:\n          tabValue === 1\n            ? [\n                9,\n                10,\n                11,\n              ]\n            : [\n                10,\n              ],\n        centerColumns:\n          tabValue === 1\n            ? [\n                2,\n              ]\n            : [\n                3,\n                9,\n              ],\n      });\n\n      const buffer ="}, {"label": "탭 선택 버튼 잘림 수정", "oldText": "        <Tabs\n          value={tabValue}\n          variant=\"scrollable\"\n          scrollButtons={false}\n          onChange={(\n            _event,\n            value,\n          ) =>\n            setTabValue(value)\n          }\n          sx={{\n            minHeight: 36,\n            width: 'fit-content',\n            maxWidth: 'calc(100% - 16px)',\n            m: 0.8,\n            mb: 0.65,\n            p: 0.35,\n            border: '1px solid #cbd5e1',\n            borderRadius: 999,\n            bgcolor: '#f8fafc',\n            '& .MuiTabs-indicator': {\n              display: 'none',\n            },\n            '& .MuiTabs-flexContainer': {\n              gap: 0.45,\n            },", "newText": "        <Tabs\n          value={tabValue}\n          variant=\"standard\"\n          onChange={(\n            _event,\n            value,\n          ) =>\n            setTabValue(value)\n          }\n          sx={{\n            minHeight: 36,\n            width: 'fit-content',\n            maxWidth: 'calc(100% - 16px)',\n            m: 0.8,\n            mb: 0.65,\n            px: 0.55,\n            py: 0.45,\n            overflow: 'visible',\n            border: '1px solid #cbd5e1',\n            borderRadius: 999,\n            bgcolor: '#f8fafc',\n            '& .MuiTabs-scroller': {\n              overflow: 'visible !important',\n            },\n            '& .MuiTabs-indicator': {\n              display: 'none',\n            },\n            '& .MuiTabs-flexContainer': {\n              gap: 0.45,\n              overflow: 'visible',\n            },"}];

if (!fs.existsSync(targetPath)) {
  console.error(
    `[적용 중단] 파일을 찾을 수 없습니다: ${targetPath}`,
  );
  process.exit(1);
}

let source =
  fs.readFileSync(
    targetPath,
    'utf8',
  );

let changed = false;

for (const replacement of replacements) {
  if (
    source.includes(
      replacement.newText,
    )
  ) {
    console.log(
      `[이미 적용됨] ${replacement.label}`,
    );
    continue;
  }

  if (
    !source.includes(
      replacement.oldText,
    )
  ) {
    console.error(
      `[적용 중단] ${replacement.label} 위치가 현재 파일과 다릅니다.`,
    );
    console.error(
      '기존 변경을 보호하기 위해 자동 덮어쓰기를 하지 않았습니다.',
    );
    process.exit(1);
  }

  source =
    source.replace(
      replacement.oldText,
      replacement.newText,
    );

  changed = true;

  console.log(
    `[적용] ${replacement.label}`,
  );
}

if (!changed) {
  console.log(
    '\n전체 변경이 이미 적용되어 있습니다.',
  );
  process.exit(0);
}

const stamp =
  new Date()
    .toISOString()
    .replace(/[:.]/g, '-');

const backupPath =
  `${targetPath}.bak-${VERSION}-${stamp}`;

fs.copyFileSync(
  targetPath,
  backupPath,
);

fs.writeFileSync(
  targetPath,
  source,
  'utf8',
);

console.log(
  `\n[적용 완료] ${path.relative(projectRoot, targetPath)}`,
);
console.log(
  `[백업] ${path.relative(projectRoot, backupPath)}`,
);
console.log(
  '자재투입현황 Excel 문서서식 및 탭 선택 버튼 표시를 보정했습니다.',
);
