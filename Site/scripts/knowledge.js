// Define a URL base dinamicamente
const API_BASE_URL = (window.location.protocol === "file:") 
  ? "http://aldebaram" // Se abrir o HTML direto do PC (file://), aponta para o ESP32 na rede
  : "";                // Se rodar direto do ESP32, usa URL relativa vazia (funciona com IP ou mDNS)

// 1. JSON com Estado Inicial de Expansão (expanded: false)
let knowledgeBaseData = [];

let knowledgeActiveItemId = 0;
let currentSelectedGroup = null; // Armazena a pasta selecionada manualmente na sidebar
let readOnlyMode = false;

// Variáveis para controle do menu de contexto atual
let contextMenuTarget = null; // { type: 'group' | 'file', groupName: '...', fileName: '...' }

// Variáveis globais para controle do PDF.js
let pdfDoc = null,
    pageNum = 1,
    pageRendering = false,
    pageNumPending = null,
    scale = 1.5;

let pdfCanvas = document.getElementById('pdf-canvas');
let pdfCtx = pdfCanvas ? pdfCanvas.getContext('2d') : null;

// 2. Inicialização do EasyMDE
const easyMDE = new EasyMDE({
  element: $("#editor")[0],
  spellChecker: false,
  autofocus: true,
  forceSync: true,
  status: false,
  toolbar: [
    "bold",
    "italic",
    "strikethrough",
    "heading",
    "heading-smaller",
    "heading-bigger",
    "heading-1",
    "heading-2",
    "heading-3",
    "|",
    "code",
    "quote",
    "unordered-list",
    "ordered-list",
    "clean-block",
    "|",
    "link",
    "image",
    "upload-image",
    "table",
    "horizontal-rule",
    "|",
    "preview",
    "side-by-side",
    "fullscreen",
    "|",
    "undo",
    "redo",
    "|",
    "guide",
  ],
  renderingConfig: {
    sanitizerFunction: function (renderedHTML) {
      return renderedHTML;
    },
  },
});

function loadKnowledgeData() {
  $.ajax({
      url: API_BASE_URL + "/api/list",
      type: "GET",
      dataType: "json",
      success: function(data) {
        knowledgeBaseData = data.map(grupo => ({
          ...grupo,
          itens: grupo.itens.map(item => ({
            ...item,
            conteudo: item.conteudo || ""
          }))
        }));

        renderSidebar(getGroupsWithFilteredKnowledgeItem());
        
        if (knowledgeBaseData.length > 0 && knowledgeBaseData[0].itens.length > 0) {
          selectKnowledgeItem(knowledgeBaseData[0].itens[0].id);
        }
      },
      error: function(jqXHR, textStatus, errorThrown) {
          console.error("Erro ao acessar a API:", textStatus, errorThrown);
      }
  });
}

function loadFileContent(folderName, fileName, itemObj) {
  const isPdf = fileName.toLowerCase().endsWith(".pdf");

  $.ajax({
      url: API_BASE_URL + "/api/read",
      type: "GET",
      data: {
          folder: folderName,
          file: fileName
      },
      xhrFields: {
          responseType: isPdf ? 'blob' : 'text'
      },
      beforeSend: function() {
          $(".CodeMirror").hide();
          $(".editor-toolbar").hide();
          if ($("#pdf-viewer-container").length > 0) {
              $("#pdf-viewer-container").hide();
          }
          $("#loading-spinner").show();
      },
      success: function(content) {
          $("#loading-spinner").hide();

          if (isPdf) {
            itemObj.conteudo = content;

            if ($("#pdf-viewer-container").length === 0) {
              $("#editor").parent().append(`
                <div id="pdf-viewer-container" style="text-align: center; overflow: auto; height: 100%; padding: 10px;">
                  <canvas id="pdf-canvas" style="border: 1px solid #ccc; max-width: 100%;"></canvas>
                  <div id="pdf-controls" style="margin-top: 10px;">
                    <button id="prev-page" class="btn">Anterior</button>
                    <span style="margin: 0 10px;">Página: <span id="page-num"></span> / <span id="page-count"></span></span>
                    <button id="next-page" class="btn">Próxima</button>
                  </div>
                </div>
              `);
              pdfCanvas = document.getElementById('pdf-canvas');
              pdfCtx = pdfCanvas.getContext('2d');
            } else {
              $("#pdf-viewer-container").show();
            }

            let fileURL = URL.createObjectURL(content);

            pdfjsLib.getDocument(fileURL).promise.then(function(pdfDoc_) {
              pdfDoc = pdfDoc_;
              document.getElementById('page-count').textContent = pdfDoc.numPages;
              pageNum = 1;
              renderPage(pageNum);
            }).catch(function(err) {
              console.error("Erro ao renderizar PDF via PDF.js:", err);
            });

          } else {
            if ($("#pdf-viewer-container").length > 0) {
              $("#pdf-viewer-container").hide();
            }
            $(".CodeMirror").show();
            if (!readOnlyMode) {
              $(".editor-toolbar").show();
            }

            itemObj.conteudo = content;
            easyMDE.value(content);
          }
      },
      error: function(jqXHR, textStatus, errorThrown) {
          $("#loading-spinner").hide();
          console.error("Erro ao carregar o arquivo:", textStatus, errorThrown);
          alert("Erro ao carregar o arquivo do servidor.");
      }
  });
}

function renderPage(num) {
  pageRendering = true;
  $("#loading-spinner").show();
  if (pdfCanvas) $(pdfCanvas).hide();

  pdfDoc.getPage(num).then(function(page) {
    var viewport = page.getViewport({ scale: scale });
    pdfCanvas.height = viewport.height;
    pdfCanvas.width = viewport.width;

    var renderContext = {
      canvasContext: pdfCtx,
      viewport: viewport
    };
    var renderTask = page.render(renderContext);

    renderTask.promise.then(function() {
      pageRendering = false;
      $("#loading-spinner").hide();
      if (pdfCanvas) $(pdfCanvas).show();

      if (pageNumPending !== null) {
        renderPage(pageNumPending);
        pageNumPending = null;
      }
    });
  }).catch(function(err) {
    $("#loading-spinner").hide();
    if (pdfCanvas) $(pdfCanvas).show();
    console.error("Erro ao renderizar página do PDF:", err);
  });

  const pageNumEl = document.getElementById('page-num');
  if (pageNumEl) pageNumEl.textContent = num;
}

function queueRenderPage(num) {
  if (pageRendering) {
    pageNumPending = num;
  } else {
    renderPage(num);
  }
}

$(document).on('click', '#prev-page', function() {
  if (pageNum <= 1) return;
  pageNum--;
  queueRenderPage(pageNum);
});

$(document).on('click', '#next-page', function() {
  if (pageNum >= pdfDoc.numPages) return;
  pageNum++;
  queueRenderPage(pageNum);
});

// 3. Renderização com Expandir/Recolher e Atributos de Identificação
function renderSidebar(groupFiltered) {
  let totalKnowledgeVisibleItens = 0;
  $("#list-knowledge-groups").empty();

  $.each(groupFiltered, function (_, group) {
    totalKnowledgeVisibleItens += group.itens.length;

    const estaexpanded = $("#input-search").val().trim().length > 0 ? true : group.expanded;
    const classeFechada = estaexpanded ? "" : "fechada";
    const IconPasta = estaexpanded ? "fa-folder-open" : "fa-folder";
    const isGroupActive = (currentSelectedGroup === group.groupName) ? "active-group" : "";

    const $pastaLi = $(`
        <li>
          <div class="group-header ${classeFechada} ${isGroupActive}" data-group-name="${group.groupName}" data-id-pasta="${group.groupId}">
            <div class="pasta-info">
              <i class="fa ${IconPasta}"></i>
              <span>${group.groupName}</span>
            </div>
            <i class="fa fa-chevron-down pasta-seta"></i>
          </div>
          <ul class="grupo-itens" style="display: ${estaexpanded ? "block" : "none"};"></ul>
        </li>
      `);

    const $ulItens = $pastaLi.find(".grupo-itens");

    if (group.itens && group.itens.length > 0) {
      $.each(group.itens, function (_, item) {
        const classeAtiva = item.id === knowledgeActiveItemId ? "active" : "";
        const $itemLi = $(`
              <li class="item-knowledge ${classeAtiva}" data-id="${item.id}" data-file-title="${item.title}" data-group-name="${group.groupName}">
                <i class="fa ${item.Icon}"></i> ${item.title}
              </li>`);
        $ulItens.append($itemLi);
      });
    }

    $("#list-knowledge-groups").append($pastaLi);
  });

  if (groupFiltered.length === 0) {
    $("#list-knowledge-groups").html('<li class="no-results">Nenhum item encontrado</li>');
  }
}

function getGroupsWithFilteredKnowledgeItem() {
  const search = $("#input-search").val().toLowerCase();

  return $.map(knowledgeBaseData, function (grupo) {
    const itensFiltrados = $.grep(grupo.itens, function (item) {
      return item.title.toLowerCase().includes(search);
    });

    return {
      groupId: grupo.groupId,
      groupName: grupo.groupName,
      Icon: grupo.Icon,
      expanded: grupo.expanded,
      itens: itensFiltrados,
    };
  });
}

function switchGroupExpansion(groupId) {
  const groupKnowledge = knowledgeBaseData.find((p) => p.groupId === groupId);
  if (groupKnowledge) {
    groupKnowledge.expanded = !groupKnowledge.expanded;
    renderSidebar(getGroupsWithFilteredKnowledgeItem());
  }
}

function findKnowledgeItemById(id) {
  let searchKnowledgeItem = null;
  $.each(knowledgeBaseData, function (_, grupo) {
    const achou = $.grep(grupo.itens, function (item) {
      return item.id === id;
    });
    if (achou.length > 0) {
      searchKnowledgeItem = achou[0];
      return false;
    }
  });
  return searchKnowledgeItem;
}

function selectKnowledgeItem(id) {
  const knowledgeItem = findKnowledgeItemById(id);
  if (!knowledgeItem) return;

  knowledgeActiveItemId = knowledgeItem.id;
  $("#titulo-topico").text(knowledgeItem.title);

  let parentGroupName = "";
  $.each(knowledgeBaseData, function (_, grupo) {
    if (grupo.itens.some((i) => i.id === id)) {
      grupo.expanded = true;
      parentGroupName = grupo.groupName; 
      currentSelectedGroup = grupo.groupName; 
    }
  });

  renderSidebar(getGroupsWithFilteredKnowledgeItem());

  if (knowledgeItem.conteudo && (typeof knowledgeItem.conteudo === 'string' ? knowledgeItem.conteudo.trim() !== "" : true)) {
    if (knowledgeItem.title.toLowerCase().endsWith(".pdf")) {
      $(".CodeMirror").hide();
      $(".editor-toolbar").hide();
      if ($("#pdf-viewer-container").length > 0) $("#pdf-viewer-container").show();

      pdfjsLib.getDocument({ data: knowledgeItem.conteudo }).promise.then(function(pdfDoc_) {
        pdfDoc = pdfDoc_;
        document.getElementById('page-count').textContent = pdfDoc.numPages;
        pageNum = 1;
        renderPage(pageNum);
      });
    } else {
      if ($("#pdf-viewer-container").length > 0) $("#pdf-viewer-container").hide();
      $(".CodeMirror").show();
      if (!readOnlyMode) $(".editor-toolbar").show();
      easyMDE.value(knowledgeItem.conteudo);
    }
  } else {
    loadFileContent(parentGroupName, knowledgeItem.title, knowledgeItem);
  }
}

function saveKnowledge() {
  const knowledgeItem = findKnowledgeItemById(knowledgeActiveItemId);
  if (!knowledgeItem) return;

  if (knowledgeItem.title.toLowerCase().endsWith(".pdf")) {
    showToast("Não é possível editar ou salvar arquivos PDF.", "error");
    return;
  }

  let parentGroupName = "";
  $.each(knowledgeBaseData, function (_, grupo) {
    if (grupo.itens.some((i) => i.id === knowledgeActiveItemId)) {
      parentGroupName = grupo.groupName;
      return false;
    }
  });

  const updatedContent = easyMDE.value();
  const $btn = $("#btn-saveKnowledge");
  $btn.prop("disabled", true).html('<i class="fa fa-spinner fa-spin"></i> Salvando...');

  $.ajax({
    url: API_BASE_URL + "/api/save",
    type: "POST",
    data: {
      folder: parentGroupName,
      file: knowledgeItem.title,
      content: updatedContent
    },
    success: function(response) {
      knowledgeItem.conteudo = updatedContent;
      showToast(`Arquivo "${knowledgeItem.title}" salvo com sucesso!`, "success");
    },
    error: function(jqXHR, textStatus, errorThrown) {
      console.error("Erro ao salvar o arquivo:", textStatus, errorThrown);
      showToast("Erro ao salvar o arquivo no servidor.", "error");
    },
    complete: function() {
      $btn.prop("disabled", false).text("Salvar .MD");
    }
  });
}

function setEditorReadOnly(isReadOnly) {
  readOnlyMode = isReadOnly;
  easyMDE.codemirror.setOption("readOnly", isReadOnly);

  if (isReadOnly) {
    $(".editor-toolbar").hide();
  } else {
    if (!$("#titulo-topico").text().toLowerCase().endsWith(".pdf")) {
      $(".editor-toolbar").show();
    }
  }

  if (isReadOnly !== easyMDE.isPreviewActive()) {
    easyMDE.togglePreview();
  }

  $("#btn-modo").text(isReadOnly ? "Modo Edição" : "Apenas Leitura");
}

function showToast(message, type = "success") {
  const $toast = $("#toast-message");
  $toast.text(message);
  $toast.css("background-color", type === "success" ? "#28a745" : "#dc3545");
  $toast.fadeIn(300);

  setTimeout(function() {
    $toast.fadeOut(300);
  }, 3000);
}

function createNewKnowledgeItem() {
  let currentGroup = null;

  if (currentSelectedGroup) {
    currentGroup = knowledgeBaseData.find(g => g.groupName === currentSelectedGroup);
  }

  if (!currentGroup) {
    $.each(knowledgeBaseData, function (_, grupo) {
      if (grupo.itens.some((i) => i.id === knowledgeActiveItemId)) {
        currentGroup = grupo;
        return false;
      }
    });
  }

  if (!currentGroup && knowledgeBaseData.length > 0) {
    currentGroup = knowledgeBaseData[0];
  }

  if (!currentGroup) {
    showToast("Nenhuma pasta encontrada para criar o arquivo.", "error");
    return;
  }

  let title = prompt(`Criar novo arquivo em "${currentGroup.groupName}"\nDigite o nome do arquivo (ex: MeuNovoTopico.md):`);
  if (!title || title.trim() === "") return;

  if (!title.toLowerCase().endsWith(".md")) {
    title += ".md";
  }

  const jaExiste = currentGroup.itens.some(item => item.title.toLowerCase() === title.toLowerCase());
  if (jaExiste) {
    showToast("Já existe um arquivo com esse nome nesta pasta!", "error");
    return;
  }

  const newId = "file-" + Date.now();
  const newItem = {
    id: newId,
    title: title.trim(),
    Icon: "fa-code",
    conteudo: `# ${title.replace('.md', '')}\n\nEscreva seu conteúdo aqui...`
  };

  currentGroup.itens.push(newItem);
  currentGroup.expanded = true;

  $.ajax({
    url: API_BASE_URL + "/api/save",
    type: "POST",
    data: {
      folder: currentGroup.groupName,
      file: newItem.title,
      content: newItem.conteudo
    },
    success: function() {
      showToast(`Arquivo "${newItem.title}" criado com sucesso!`, "success");
      renderSidebar(getGroupsWithFilteredKnowledgeItem());
      selectKnowledgeItem(newId);

      setTimeout(function() {
        easyMDE.codemirror.focus();
        easyMDE.codemirror.setCursor(easyMDE.codemirror.lineCount(), 0);
      }, 100);
    },
    error: function(jqXHR, textStatus, errorThrown) {
      console.error("Erro ao criar arquivo no SD:", textStatus, errorThrown);
      showToast("Erro ao criar o arquivo no servidor.", "error");
    }
  });
}

function createNewGroup() {
  let groupName = prompt("Digite o nome do novo grupo (pasta):");
  if (!groupName || groupName.trim() === "") return;

  groupName = groupName.trim();

  const jaExiste = knowledgeBaseData.some(grupo => grupo.groupName.toLowerCase() === groupName.toLowerCase());
  if (jaExiste) {
    showToast("Já existe um grupo com esse nome!", "error");
    return;
  }

  $.ajax({
    url: API_BASE_URL + "/api/create-group",
    type: "POST",
    data: {
      group: groupName
    },
    success: function(response) {
      showToast(`Grupo "${groupName}" criado com sucesso!`, "success");

      const newGroup = {
        groupName: groupName,
        expanded: true,
        itens: []
      };

      knowledgeBaseData.push(newGroup);
      
      currentSelectedGroup = groupName;
      knowledgeActiveItemId = null;
      $(".item-knowledge").removeClass("active");
      easyMDE.value("");
      $("#titulo-topico").text(`[Sem titulo - em '${groupName}']`);
      if ($("#pdf-viewer-container").length > 0) $("#pdf-viewer-container").hide();
      $(".CodeMirror").show();
      if (!readOnlyMode) $(".editor-toolbar").show();

      renderSidebar(getGroupsWithFilteredKnowledgeItem());
    },
    error: function(jqXHR, textStatus, errorThrown) {
      console.error("Erro ao criar o grupo no SD:", textStatus, errorThrown);
      let errorMsg = "Erro ao criar o grupo no servidor.";
      if (jqXHR.responseJSON && jqXHR.responseJSON.error) {
        errorMsg = jqXHR.responseJSON.error;
      }
      showToast(errorMsg, "error");
    }
  });
}

// ==========================================
// FUNÇÕES DO MENU DE CONTEXTO (Renomear / Excluir)
// ==========================================

function renameGroup(oldName) {
  let newName = prompt(`Renomear grupo "${oldName}" para:`, oldName);
  if (!newName || newName.trim() === "" || newName.trim() === oldName) return;
  newName = newName.trim();

  $.ajax({
    url: API_BASE_URL + "/api/rename-group",
    type: "POST",
    data: { oldName: oldName, newName: newName },
    success: function() {
      showToast("Grupo renomeado com sucesso!", "success");
      loadKnowledgeData();
    },
    error: function() {
      showToast("Erro ao renomear o grupo no servidor.", "error");
    }
  });
}

function deleteGroup(groupName) {
  if (!confirm(`Tem certeza que deseja excluir o grupo "${groupName}" e todo o seu conteúdo?`)) return;

  $.ajax({
    url: API_BASE_URL + "/api/delete-group",
    type: "POST",
    data: { group: groupName },
    success: function() {
      showToast("Grupo excluído com sucesso!", "success");
      if (currentSelectedGroup === groupName) currentSelectedGroup = null;
      loadKnowledgeData();
    },
    error: function() {
      showToast("Erro ao excluir o grupo no servidor.", "error");
    }
  });
}

function renameFile(groupName, fileName) {
  let newName = prompt(`Renomear arquivo "${fileName}" para (ex: novoNome.md):`, fileName);
  if (!newName || newName.trim() === "" || newName.trim() === fileName) return;
  newName = newName.trim();
  if (!newName.toLowerCase().endsWith(".md") && !newName.toLowerCase().endsWith(".pdf")) {
    newName += ".md";
  }

  $.ajax({
    url: API_BASE_URL + "/api/rename-file",
    type: "POST",
    data: { folder: groupName, oldFile: fileName, newFile: newName },
    success: function() {
      showToast("Arquivo renomeado com sucesso!", "success");
      loadKnowledgeData();
    },
    error: function() {
      showToast("Erro ao renomear o arquivo no servidor.", "error");
    }
  });
}

function deleteFile(groupName, fileName) {
  if (!confirm(`Deseja realmente excluir o arquivo "${fileName}"?`)) return;

  $.ajax({
    url: API_BASE_URL + "/api/delete-file",
    type: "POST",
    data: { folder: groupName, file: fileName },
    success: function() {
      showToast("Arquivo excluído com sucesso!", "success");
      loadKnowledgeData();
    },
    error: function() {
      showToast("Erro ao excluir o arquivo no servidor.", "error");
    }
  });
}

// Função para selecionar e enviar um PDF para a pasta ativa atual
function uploadPdfFile() {
  let currentGroup = null;

  if (currentSelectedGroup) {
    currentGroup = knowledgeBaseData.find(g => g.groupName === currentSelectedGroup);
  }

  if (!currentGroup) {
    $.each(knowledgeBaseData, function (_, grupo) {
      if (grupo.itens.some((i) => i.id === knowledgeActiveItemId)) {
        currentGroup = grupo;
        return false;
      }
    });
  }

  if (!currentGroup && knowledgeBaseData.length > 0) {
    currentGroup = knowledgeBaseData[0];
  }

  if (!currentGroup) {
    showToast("Selecione uma pasta para enviar o PDF.", "error");
    return;
  }

  const $fileInput = $('<input type="file" accept=".pdf" style="display: none;">');
  $("body").append($fileInput);

  $fileInput.on("change", function(e) {
    const file = e.target.files[0];
    if (!file) {
      $fileInput.remove();
      return;
    }

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      showToast("Apenas arquivos PDF são permitidos neste botão.", "error");
      $fileInput.remove();
      return;
    }

    const formData = new FormData();
    formData.append("folder", currentGroup.groupName);
    formData.append("file", file);

    showToast(`Enviando "${file.name}"...`, "success");

    $.ajax({
      url: API_BASE_URL + "/api/upload",
      type: "POST",
      data: formData,
      processData: false,
      contentType: false,
      success: function(response) {
        showToast(`PDF "${file.name}" enviado com sucesso!`, "success");
        $fileInput.remove();
        loadKnowledgeData();
      },
      error: function(jqXHR, textStatus, errorThrown) {
        console.error("Erro no upload do PDF:", textStatus, errorThrown);
        showToast("Erro ao enviar o PDF para o servidor.", "error");
        $fileInput.remove();
      }
    });
  });

  $fileInput.click();
}

// Eventos do jQuery
$(document).ready(function () {

  $("#btn-addGroup").on("click", createNewGroup);
  $("#btn-newKnowledge").on("click", createNewKnowledgeItem);
  $("#btn-uploadPdf").on("click", uploadPdfFile);

  // ==========================================
  // CONTROLE DA SIDEBAR NO CELULAR (MENU MOBILE)
  // ==========================================
  $("#btn-toggle-sidebar").on("click", function (e) {
    e.stopPropagation();
    $(".sidebar").toggleClass("mobile-open");
    $(".sidebar-overlay").toggleClass("active");
  });

  $(document).on("click", ".sidebar-overlay", function () {
    $(".sidebar").removeClass("mobile-open");
    $(".sidebar-overlay").removeClass("active");
  });

  $(document).on("click", ".item-knowledge, .group-header", function () {
    if (window.innerWidth <= 768) {
      $(".sidebar").removeClass("mobile-open");
      $(".sidebar-overlay").removeClass("active");
    }
  });

  // Clique esquerdo nas pastas
  $("#list-knowledge-groups").on("click", ".group-header", function (e) {
    e.stopPropagation();
    $(".group-header").removeClass("active-group");
    $(this).addClass("active-group");
    currentSelectedGroup = $(this).attr("data-group-name");

    knowledgeActiveItemId = null;
    $(".item-knowledge").removeClass("active");
    easyMDE.value("");
    $("#titulo-topico").text(`[Sem titulo - em '${currentSelectedGroup}']`);
    
    if ($("#pdf-viewer-container").length > 0) $("#pdf-viewer-container").hide();
    $(".CodeMirror").show();
    if (!readOnlyMode) $(".editor-toolbar").show();

    switchGroupExpansion($(this).data("id-pasta"));
  });

  // Clique esquerdo nos arquivos
  $("#list-knowledge-groups").on("click", ".item-knowledge[data-id]", function (e) {
    e.stopPropagation();
    selectKnowledgeItem($(this).data("id"));
  });

  // ==========================================
  // EVENTO DE CLIQUE DIREITO (CONTEXT MENU)
  // ==========================================

  $("#list-knowledge-groups").on("contextmenu", ".group-header", function (e) {
    e.preventDefault();
    e.stopPropagation();
    
    contextMenuTarget = {
      type: 'group',
      groupName: $(this).attr("data-group-name")
    };

    const top = e.pageY;
    const left = e.pageX;
    $("#custom-context-menu").css({ top: top + "px", left: left + "px" }).show();
  });

  $("#list-knowledge-groups").on("contextmenu", ".item-knowledge", function (e) {
    e.preventDefault();
    e.stopPropagation();

    contextMenuTarget = {
      type: 'file',
      groupName: $(this).attr("data-group-name"),
      fileName: $(this).attr("data-file-title")
    };

    const top = e.pageY;
    const left = e.pageX;
    $("#custom-context-menu").css({ top: top + "px", left: left + "px" }).show();
  });

  $(document).on("click", function () {
    $("#custom-context-menu").hide();
  });

  $("#ctx-rename").on("click", function (e) {
    e.preventDefault();
    $("#custom-context-menu").hide();
    if (!contextMenuTarget) return;

    if (contextMenuTarget.type === 'group') {
      renameGroup(contextMenuTarget.groupName);
    } else if (contextMenuTarget.type === 'file') {
      renameFile(contextMenuTarget.groupName, contextMenuTarget.fileName);
    }
  });

  $("#ctx-delete").on("click", function (e) {
    e.preventDefault();
    $("#custom-context-menu").hide();
    if (!contextMenuTarget) return;

    if (contextMenuTarget.type === 'group') {
      deleteGroup(contextMenuTarget.groupName);
    } else if (contextMenuTarget.type === 'file') {
      deleteFile(contextMenuTarget.groupName, contextMenuTarget.fileName);
    }
  });

  $("#input-search").on("input keyup", function () {
    renderSidebar(getGroupsWithFilteredKnowledgeItem());
  });

  $("#btn-modo").on("click", function () {
    setEditorReadOnly(!readOnlyMode);
  });

  $("#btn-saveKnowledge").on("click", saveKnowledge);

  loadKnowledgeData();
});