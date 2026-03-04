const { exec } = require('child_process');
const os = require('os');
const path = require('path');

module.exports = {
  runtime: {
    handler: async function ({ filePath }) {
      // 取得技能名稱與版本作為系統日誌識別
      const callerId = `${this.config?.name || 'open_file'}-v${this.config?.version || '1.0.0'}`;
      
      try {
        if (!filePath) {
          return "錯誤：未提供檔案路徑。";
        }

        // 標準化路徑
        const normalizedPath = path.normalize(filePath);
        this.introspect(`${callerId}: 正在嘗試開啟檔案 ${normalizedPath}`);

        const platform = os.platform();
        let command;

        // 判斷作業系統並指派對應的開啟指令
        if (platform === 'win32') {
          command = `start "" "${normalizedPath}"`;
        } else if (platform === 'darwin') {
          command = `open "${normalizedPath}"`;
        } else {
          command = `xdg-open "${normalizedPath}"`;
        }

        // 執行系統指令並加入權限錯誤判斷
        return await new Promise((resolve) => {
          exec(command, (error, stdout, stderr) => {
            if (error) {
              // 檢查是否為常見的權限錯誤代碼或訊息
              const isPermissionError = 
                error.code === 'EACCES' || 
                error.code === 'EPERM' || 
                (stderr && stderr.toLowerCase().includes('access is denied')) ||
                (stderr && stderr.toLowerCase().includes('permission denied'));

              let errMsg;
              if (isPermissionError) {
                errMsg = `開啟失敗：權限不足 (${error.code || 'Access Denied'})。請確認檔案是否被其他程式鎖定，或者 AnythingLLM 可能需要以「系統管理員 (Administrator)」身分執行才能開啟此檔案。`;
              } else {
                errMsg = `無法開啟檔案。系統錯誤訊息: ${error.message}`;
              }
              
              // 將錯誤印在終端機並回傳給 LLM
              this.introspect(`${callerId} 錯誤: ${errMsg}`);
              resolve(errMsg); 
            } else {
              const successMsg = `已成功使用系統預設程式開啟檔案: ${normalizedPath}`;
              this.introspect(successMsg);
              resolve(successMsg);
            }
          });
        });

      } catch (e) {
        const errorMessage = `${callerId} 執行時發生未預期的例外錯誤。原因: ${e.message}`;
        this.introspect(errorMessage);
        return errorMessage;
      }
    }
  }
};
