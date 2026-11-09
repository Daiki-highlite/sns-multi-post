import { AppError } from "./domain.ts";
export function csvRows(input: string): string[][] {
  const text=input.replace(/^\uFEFF/,""), rows:string[][]=[]; let row:string[]=[],value="",quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"') { if(quoted&&text[i+1]==='"'){value+='"';i++;}else if(quoted){quoted=false;}else if(value===""){quoted=true;}else throw new AppError("CSVの引用符を確認してください。"); }
    else if(c===","&&!quoted){row.push(value);value="";}
    else if((c==="\n"||c==="\r")&&!quoted){if(c==="\r"&&text[i+1]==="\n")i++;row.push(value);if(row.some(Boolean))rows.push(row);row=[];value="";}
    else value+=c;
  }
  if(quoted)throw new AppError("CSVの引用符が閉じられていません。");
  row.push(value);if(row.some(Boolean))rows.push(row);return rows;
}
